import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PrismaService, Tx } from "../common/prisma.service";
import { InventoryService, availableOf } from "../inventory/inventory.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { assertOptions, computeTotals, type FulfilmentType, type PaymentMethod, type Serviceability } from "../checkout/pricing";

export const lineSchema = z.object({ sku: z.string().min(1).max(40), quantity: z.number().int().min(1).max(10) });
export const quoteSchema = z.object({ lines: z.array(lineSchema).min(1).max(30), fulfilmentType: z.enum(["COURIER", "LOCAL", "PICKUP"]), paymentMethod: z.enum(["UPI", "CARD", "COD"]), pincode: z.string().regex(/^\d{6}$/).optional() });
export const orderSchema = quoteSchema.extend({
  idempotencyKey: z.string().min(8).max(80),
  contact: z.object({ name: z.string().min(2).max(80), phone: z.string().regex(/^[6-9]\d{9}$/) }),
  address: z.object({ line1: z.string().min(3).max(160), line2: z.string().max(160).optional(), city: z.string().min(2).max(60), state: z.string().min(2).max(60), postalCode: z.string().regex(/^\d{6}$/) }).optional(),
});

const FLOW: Record<string, Record<string, string[]>> = {
  COURIER: { CONFIRMED: ["PICKING"], PICKING: ["PACKED"], PACKED: ["DISPATCHED"], DISPATCHED: ["DELIVERED"] },
  LOCAL: { CONFIRMED: ["PICKING"], PICKING: ["PACKED"], PACKED: ["DISPATCHED"], DISPATCHED: ["DELIVERED"] },
  PICKUP: { CONFIRMED: ["READY_FOR_PICKUP"], READY_FOR_PICKUP: ["COLLECTED"] },
};
const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED", "PICKING", "PACKED", "READY_FOR_PICKUP"]);
const PATH: Record<string, [string, string][]> = {
  COURIER: [["CONFIRMED", "Order confirmed"], ["PICKING", "Being picked"], ["PACKED", "Packed"], ["DISPATCHED", "Dispatched"], ["DELIVERED", "Delivered"]],
  LOCAL: [["CONFIRMED", "Order confirmed"], ["PICKING", "Being picked"], ["PACKED", "Packed"], ["DISPATCHED", "Out for delivery"], ["DELIVERED", "Delivered"]],
  PICKUP: [["CONFIRMED", "Order confirmed"], ["READY_FOR_PICKUP", "Ready for pickup"], ["COLLECTED", "Collected"]],
};
const SHOWROOM_ADDRESS = { line1: "JAFSON Showroom", city: "Jammu", state: "Jammu & Kashmir", postalCode: "180001" };

type OrderFull = Prisma.OrderGetPayload<{ include: { items: true; history: true } }>;

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Orders");
  private timer?: NodeJS.Timeout;
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService) {}

  onModuleInit() { if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => this.expireStale().catch((e) => this.log.error(e)), 60_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async serviceability(pincode: string): Promise<Serviceability & { pincode: string; estimate: string }> {
    if (!/^\d{6}$/.test(pincode)) throw new AppError("INVALID_PINCODE", "Enter a valid 6-digit pincode", 422);
    const row = await this.prisma.serviceablePincode.findUnique({ where: { pincode } });
    const local = row?.deliveryType === "LOCAL";
    return { pincode, courier: true, local, pickup: true, codAllowed: row ? row.codAllowed : true, localFeePaise: row?.feePaise ?? cfg().localFeePaise, estimate: local ? "Same or next day" : "3–6 days" };
  }

  private async load(lines: { sku: string; quantity: number }[]) {
    const merged = new Map<string, number>();
    for (const l of lines) merged.set(l.sku, (merged.get(l.sku) ?? 0) + l.quantity);
    const variants = await this.prisma.productVariant.findMany({ where: { sku: { in: [...merged.keys()] }, isActive: true, product: { status: "ACTIVE" } }, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } });
    const missing = [...merged.keys()].filter((s) => !variants.find((v) => v.sku === s));
    if (missing.length) throw new AppError("INVALID_SKU", "Some items are no longer available", 422, { skus: missing });
    return variants.map((v) => { const q = merged.get(v.sku)!; if (q > cfg().maxQtyPerLine) throw new AppError("QUANTITY_LIMIT", `Maximum ${cfg().maxQtyPerLine} per item`, 422, { sku: v.sku }); return { v, quantity: q }; });
  }

  /** Totals are always computed here; any client-supplied price is ignored (spec 5.5). */
  async quote(b: z.infer<typeof quoteSchema>) {
    const items = await this.load(b.lines);
    const s = await this.serviceability(b.pincode ?? "180001");
    const totals = computeTotals(items.map(({ v, quantity }) => ({ unitPricePaise: v.pricePaise, quantity, gstRateBps: v.product.gstRateBps })), b.fulfilmentType as FulfilmentType, b.paymentMethod as PaymentMethod, s);
    const problem = assertOptions(b.fulfilmentType as FulfilmentType, b.paymentMethod as PaymentMethod, totals.subtotalPaise, s);
    const avail = await this.inv.availability(items.map(({ v }) => v.id));
    const unavailable = items.filter(({ v, quantity }) => (avail.get(v.id) ?? 0) < quantity).map(({ v }) => v.sku);
    return { ...totals, currency: "INR", problem, unavailable, items: items.map(({ v, quantity }) => ({ sku: v.sku, name: v.product.name, quantity, unitPricePaise: v.pricePaise })) };
  }

  async create(userId: string | null, b: z.infer<typeof orderSchema>) {
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: b.idempotencyKey }, include: { items: true, history: true } });
    if (existing) return this.view(existing, true);

    const items = await this.load(b.lines);
    const s = await this.serviceability(b.address?.postalCode ?? b.pincode ?? "180001");
    const totals = computeTotals(items.map(({ v, quantity }) => ({ unitPricePaise: v.pricePaise, quantity, gstRateBps: v.product.gstRateBps })), b.fulfilmentType as FulfilmentType, b.paymentMethod as PaymentMethod, s);
    const problem = assertOptions(b.fulfilmentType as FulfilmentType, b.paymentMethod as PaymentMethod, totals.subtotalPaise, s);
    if (problem) throw new AppError(problem, "This delivery or payment option isn't available for your order", 422);
    if (b.fulfilmentType !== "PICKUP" && !b.address) throw new AppError("ADDRESS_REQUIRED", "Delivery address is required", 422);

    const cod = b.paymentMethod === "COD";
    const expiresAt = cod ? null : new Date(Date.now() + cfg().reservationMinutes * 60_000);
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
        const o = await tx.order.create({
          data: {
            number: `JF${n}`, userId, status: cod ? "CONFIRMED" : "PENDING_PAYMENT", paymentStatus: cod ? "COD_PENDING" : "PENDING", paymentMethod: b.paymentMethod, fulfilmentType: b.fulfilmentType,
            ...totals, contactName: b.contact.name, contactPhone: b.contact.phone, shippingAddress: (b.fulfilmentType === "PICKUP" ? SHOWROOM_ADDRESS : b.address!) as Prisma.InputJsonValue,
            idempotencyKey: b.idempotencyKey, expiresAt, pickupCode: b.fulfilmentType === "PICKUP" ? String(randomInt(100000, 999999)) : null,
            items: { create: items.map(({ v, quantity }) => ({ variantId: v.id, sku: v.sku, productName: v.product.name, colour: v.colourName, size: v.size, imageUrl: v.product.images[0]?.url, quantity, unitPricePaise: v.pricePaise, lineTotalPaise: v.pricePaise * quantity, taxPaise: Math.round(v.pricePaise * quantity - (v.pricePaise * quantity * 10000) / (10000 + v.product.gstRateBps)) })) },
            history: { create: { toStatus: cod ? "CONFIRMED" : "PENDING_PAYMENT", actor: "customer", note: "Order placed" } },
          },
          include: { items: true, history: true },
        });
        await this.inv.reserve(tx, o.id, items.map(({ v, quantity }) => ({ variantId: v.id, sku: v.sku, quantity })), expiresAt);
        return o;
      }, { maxWait: 5000, timeout: 15000 });
      return this.view(order, false);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") { // concurrent duplicate request with same idempotency key
        const dup = await this.prisma.order.findUnique({ where: { idempotencyKey: b.idempotencyKey }, include: { items: true, history: true } });
        if (dup) return this.view(dup, true);
      }
      throw e;
    }
  }

  view(o: OrderFull, replay: boolean) {
    const done = new Map(o.history.map((h) => [h.toStatus, h.createdAt]));
    const steps = (PATH[o.fulfilmentType] ?? []).map(([code, label]) => ({ code, label, at: done.get(code) ?? null, done: done.has(code) }));
    return {
      number: o.number, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, fulfilmentType: o.fulfilmentType, placedAt: o.createdAt, expiresAt: o.expiresAt,
      pickupCode: o.fulfilmentType === "PICKUP" ? o.pickupCode : null, replay,
      totals: { subtotalPaise: o.subtotalPaise, shippingPaise: o.shippingPaise, codFeePaise: o.codFeePaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise },
      contact: { name: o.contactName, phone: o.contactPhone }, shippingAddress: o.shippingAddress,
      items: o.items.map((i) => ({ id: i.id, sku: i.sku, name: i.productName, colour: i.colour, size: i.size, imageUrl: i.imageUrl, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
      steps, cancelled: o.status === "CANCELLED",
    };
  }

  private async find(number: string, who: { userId?: string; phone?: string }) {
    const o = await this.prisma.order.findUnique({ where: { number }, include: { items: true, history: true } });
    const ok = o && ((who.userId && o.userId === who.userId) || (who.phone && o.contactPhone === who.phone));
    if (!o || !ok) throw new AppError("NOT_FOUND", "We couldn't find that order", 404); // same answer for missing and not-yours
    return o;
  }
  async get(number: string, who: { userId?: string; phone?: string }) { return this.view(await this.find(number, who), false); }
  async list(userId: string) { const os = await this.prisma.order.findMany({ where: { userId }, include: { items: true, history: true }, orderBy: { createdAt: "desc" }, take: 50 }); return os.map((o) => this.view(o, false)); }

  /** Single guarded status change; the WHERE on current status makes concurrent transitions safe. */
  private async move(tx: Tx, o: { id: string; status: string }, to: string, actor: string, note?: string, extra: Prisma.OrderUpdateManyMutationInput = {}) {
    const r = await tx.order.updateMany({ where: { id: o.id, status: o.status }, data: { status: to, ...extra } });
    if (r.count === 0) throw new AppError("STATE_CONFLICT", "Order changed while processing. Retry.", 409);
    await tx.orderStatusHistory.create({ data: { orderId: o.id, fromStatus: o.status, toStatus: to, actor, note } });
  }

  async cancel(number: string, who: { userId?: string; phone?: string }, actor = "customer") {
    const o = await this.find(number, who);
    return this.cancelOrder(o.id, actor);
  }
  async cancelOrder(orderId: string, actor: string, note = "Cancelled") {
    await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (!CANCELLABLE.has(o.status)) throw new AppError("NOT_CANCELLABLE", "This order can no longer be cancelled", 409);
      await this.move(tx, o, "CANCELLED", actor, note, { paymentStatus: o.paymentStatus === "PAID" ? "REFUND_PENDING" : o.paymentStatus === "PENDING" ? "CANCELLED" : o.paymentStatus });
      await this.inv.release(tx, o.id, "order cancelled");
    });
    return this.view(await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, history: true } }), false);
  }

  /** Staff-driven fulfilment progress. Dispatch/collection is what physically deducts stock. */
  async transition(number: string, to: string, actor: string, pickupCode?: string) {
    await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { number } });
      if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
      if (!(FLOW[o.fulfilmentType]?.[o.status] ?? []).includes(to)) throw new AppError("INVALID_TRANSITION", `Cannot move ${o.status} to ${to}`, 409);
      if (to === "COLLECTED" && (!pickupCode || pickupCode !== o.pickupCode)) throw new AppError("INVALID_PICKUP_CODE", "Pickup code does not match", 422);
      const final = to === "DELIVERED" || to === "COLLECTED";
      if (to === "DISPATCHED" || to === "COLLECTED") await this.inv.commit(tx, o.id);
      await this.move(tx, o, to, actor, undefined, { ...(final ? { deliveredAt: new Date() } : {}), ...(final && o.paymentMethod === "COD" ? { paymentStatus: "PAID" } : {}) });
    });
    return this.view(await this.prisma.order.findUniqueOrThrow({ where: { number }, include: { items: true, history: true } }), false);
  }

  async expireStale() {
    const stale = await this.prisma.order.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } }, take: 50 });
    let n = 0;
    for (const o of stale) { try { await this.cancelOrder(o.id, "system", "Payment window expired"); n++; } catch (e) { if (!(e instanceof AppError)) throw e; } }
    return n;
  }

  // ---------- payments (mock provider; real provider plugs into handleEvent) ----------
  async paymentSession(number: string, who: { userId?: string; phone?: string }) {
    const o = await this.find(number, who);
    if (o.paymentMethod === "COD") throw new AppError("NO_PAYMENT_REQUIRED", "Cash on delivery order", 409);
    if (o.status !== "PENDING_PAYMENT") throw new AppError("NOT_PAYABLE", "Order is not awaiting payment", 409);
    const open = await this.prisma.payment.findFirst({ where: { orderId: o.id, status: "CREATED" } });
    const p = open ?? (await this.prisma.payment.create({ data: { orderId: o.id, provider: "MOCK", providerRef: `mock_${randomUUID()}`, amountPaise: o.totalPaise, status: "CREATED" } }));
    return { provider: p.provider, paymentRef: p.providerRef, amountPaise: p.amountPaise, orderNumber: o.number, expiresAt: o.expiresAt };
  }

  sign(raw: string) { return createHmac("sha256", cfg().webhookSecret).update(raw).digest("hex"); }

  async webhook(raw: string, signature: string) {
    const want = Buffer.from(this.sign(raw)), got = Buffer.from(signature ?? "");
    if (!cfg().webhookSecret || want.length !== got.length || !timingSafeEqual(want, got)) throw new AppError("INVALID_SIGNATURE", "Webhook signature invalid", 401);
    const ev = z.object({ eventId: z.string().min(4), type: z.enum(["payment.captured", "payment.failed"]), paymentRef: z.string(), amountPaise: z.number().int() }).parse(JSON.parse(raw));
    return this.handlePaymentEvent(ev);
  }

  async handlePaymentEvent(ev: { eventId: string; type: string; paymentRef: string; amountPaise: number }) {
    try { await this.prisma.webhookEvent.create({ data: { provider: "MOCK", eventId: ev.eventId, payload: ev as Prisma.InputJsonValue } }); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const prev = await this.prisma.webhookEvent.findUnique({ where: { eventId: ev.eventId } });
        if (prev?.processedAt) return { status: "DUPLICATE" };
      } else throw e;
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const pay = await tx.payment.findUnique({ where: { providerRef: ev.paymentRef }, include: { order: true } });
      if (!pay) return "UNKNOWN_PAYMENT";
      if (ev.amountPaise !== pay.amountPaise) { this.log.error(`Amount mismatch on ${ev.paymentRef}`); return "AMOUNT_MISMATCH"; }
      if (ev.type === "payment.failed") { await tx.payment.updateMany({ where: { id: pay.id, status: "CREATED" }, data: { status: "FAILED" } }); return "FAILED_RECORDED"; }
      const flipped = await tx.payment.updateMany({ where: { id: pay.id, status: "CREATED" }, data: { status: "CAPTURED" } });
      if (flipped.count === 0) return "ALREADY_CAPTURED";
      const o = pay.order;
      if (o.status === "PENDING_PAYMENT") {
        await this.move(tx, o, "CONFIRMED", "payment", "Payment confirmed", { paymentStatus: "PAID", expiresAt: null });
        await tx.inventoryReservation.updateMany({ where: { orderId: o.id, status: "ACTIVE" }, data: { expiresAt: null } });
        return "CONFIRMED";
      }
      await tx.order.update({ where: { id: o.id }, data: { paymentStatus: "REFUND_DUE" } }); // paid after the order expired or was cancelled
      return "REFUND_DUE";
    });
    await this.prisma.webhookEvent.update({ where: { eventId: ev.eventId }, data: { processedAt: new Date() } });
    return { status: result };
  }

  /** Dev-only: behaves exactly like the provider calling our signed webhook. */
  async mockPay(paymentRef: string, outcome: "success" | "fail") {
    if (!cfg().paymentsMock) throw new AppError("NOT_FOUND", "Not found", 404);
    const p = await this.prisma.payment.findUnique({ where: { providerRef: paymentRef } });
    if (!p) throw new AppError("NOT_FOUND", "Payment not found", 404);
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, type: outcome === "success" ? "payment.captured" : "payment.failed", paymentRef, amountPaise: p.amountPaise });
    return this.webhook(raw, this.sign(raw));
  }
}
