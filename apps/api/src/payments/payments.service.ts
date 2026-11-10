import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { getProvider } from "./provider";

type Who = { userId?: string; phone?: string };
export const verifySchema = z.object({ orderNumber: z.string().min(4), phone: z.string().regex(/^[6-9]\d{9}$/).optional(), razorpay_order_id: z.string().min(5), razorpay_payment_id: z.string().min(5), razorpay_signature: z.string().min(10) });

@Injectable()
export class PaymentsService {
  private log = new Logger("Payments");
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(OrdersService) private orders: OrdersService) {}

  /** Starts (or resumes) a payment for an order awaiting payment. The provider order is created server-side for the exact order total. */
  async session(number: string, who: Who) {
    const o = await this.orders.find(number, who);
    if (o.paymentMethod === "COD") throw new AppError("NO_PAYMENT_REQUIRED", "Cash on delivery order", 409);
    if (o.status !== "PENDING_PAYMENT") throw new AppError("NOT_PAYABLE", "Order is not awaiting payment", 409);
    const provider = getProvider();
    let p = await this.prisma.payment.findFirst({ where: { orderId: o.id, status: "CREATED", provider: provider.name } });
    if (!p) {
      const po = await provider.createOrder({ amountPaise: o.totalPaise, receipt: o.number, notes: { order: o.number } });
      p = await this.prisma.payment.create({ data: { orderId: o.id, provider: provider.name, providerRef: po.id, amountPaise: o.totalPaise, status: "CREATED" } });
    }
    return {
      provider: p.provider, paymentRef: p.providerRef, amountPaise: p.amountPaise, currency: "INR", orderNumber: o.number, expiresAt: o.expiresAt,
      ...(provider.name === "RAZORPAY" ? { keyId: cfg().razorpayKeyId, prefill: { name: o.contactName, contact: `+91${o.contactPhone}` } } : {}),
    };
  }

  /** Browser handoff after Razorpay checkout. Trusted only after the signature checks out; the webhook is the safety net if the browser never returns. */
  async verifyCheckout(b: z.infer<typeof verifySchema>, who: Who) {
    const o = await this.orders.find(b.orderNumber, who);
    const provider = getProvider();
    const pay = await this.prisma.payment.findFirst({ where: { orderId: o.id, providerRef: b.razorpay_order_id, provider: "RAZORPAY" } });
    if (!pay) throw new AppError("PAYMENT_NOT_FOUND", "We couldn't match that payment to this order.", 404);
    if (!provider.verifyCheckout(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) throw new AppError("INVALID_SIGNATURE", "We couldn't verify this payment. If money was taken it will be matched automatically or refunded.", 400);
    const r = await this.orders.handlePaymentEvent({ eventId: `checkout:${b.razorpay_payment_id}`, type: "payment.captured", paymentRef: b.razorpay_order_id, amountPaise: pay.amountPaise, providerPaymentId: b.razorpay_payment_id }, "RAZORPAY");
    return { ...r, order: await this.orders.get(o.number, who) };
  }

  /** Razorpay webhook: signature over the raw body, idempotent on x-razorpay-event-id. Always 200 for events we ignore so Razorpay doesn't retry them. */
  async razorpayWebhook(raw: string, signature: string, eventIdHeader?: string) {
    const provider = getProvider();
    if (!provider.verifyWebhook(raw, signature)) throw new AppError("INVALID_SIGNATURE", "Webhook signature invalid", 401);
    const ev: any = JSON.parse(raw);
    const eventId = eventIdHeader || createHash("sha256").update(raw).digest("hex");
    const pay = ev.payload?.payment?.entity;
    switch (ev.event) {
      case "payment.captured": case "order.paid":
        if (!pay?.order_id) return { status: "IGNORED" };
        return this.orders.handlePaymentEvent({ eventId, type: "payment.captured", paymentRef: pay.order_id, amountPaise: pay.amount, providerPaymentId: pay.id, method: pay.method }, "RAZORPAY");
      case "payment.failed":
        if (!pay?.order_id) return { status: "IGNORED" };
        return this.orders.handlePaymentEvent({ eventId, type: "payment.failed", paymentRef: pay.order_id, amountPaise: pay.amount, providerPaymentId: pay.id }, "RAZORPAY");
      case "refund.processed": case "refund.failed": return this.refundEvent(ev.payload?.refund?.entity, ev.event === "refund.processed");
      default: return { status: "IGNORED" };
    }
  }

  private async refundEvent(r: { id: string; payment_id: string; amount: number } | undefined, ok: boolean) {
    if (!r?.id) return { status: "IGNORED" };
    const row = await this.prisma.refund.findUnique({ where: { providerRefundId: r.id } });
    if (!row) return { status: "UNKNOWN_REFUND" };
    await this.prisma.$transaction([
      this.prisma.refund.update({ where: { id: row.id }, data: { status: ok ? "PROCESSED" : "FAILED" } }),
      this.prisma.order.update({ where: { id: row.orderId }, data: { paymentStatus: ok ? "REFUNDED" : "REFUND_PENDING" } }),
    ]);
    return { status: ok ? "REFUND_PROCESSED" : "REFUND_FAILED" };
  }

  /**
   * Full refund of the captured online payment. One live refund per payment (guarded by a row lock), so a double click can't refund twice.
   * Cash-on-delivery orders have no online payment and are refunded manually.
   */
  async refund(number: string, reason: string | undefined, actor: string) {
    const o = await this.prisma.order.findUnique({ where: { number } });
    if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    if (!["CANCELLED", "DELIVERED", "COLLECTED"].includes(o.status) && !["REFUND_DUE", "REFUND_PENDING"].includes(o.paymentStatus)) throw new AppError("ORDER_ACTIVE", "This order is still being fulfilled. Cancel it first, or refund after delivery.", 409);
    const pay = await this.prisma.payment.findFirst({ where: { orderId: o.id, status: "CAPTURED" } });
    if (!pay || !pay.providerPaymentId && pay.provider === "RAZORPAY") throw new AppError("NOT_REFUNDABLE_ONLINE", "There is no captured online payment on this order. Refund it manually and mark it done.", 409);
    const provider = getProvider();
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${pay.id}::uuid FOR UPDATE`;
      const live = await tx.refund.findFirst({ where: { paymentId: pay.id, status: { in: ["PENDING", "PROCESSED"] } } });
      if (live) throw new AppError("ALREADY_REFUNDED", live.status === "PROCESSED" ? "This payment has already been refunded." : "A refund is already in progress for this payment.", 409);
      return tx.refund.create({ data: { orderId: o.id, paymentId: pay.id, amountPaise: pay.amountPaise, reason, actor } });
    });
    try {
      const r = await provider.refund(pay.providerPaymentId ?? pay.providerRef, pay.amountPaise, { order: o.number, refund: refund.id });
      const processed = r.status === "processed";
      await this.prisma.$transaction([
        this.prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: r.id, status: processed ? "PROCESSED" : "PENDING" } }),
        this.prisma.order.update({ where: { id: o.id }, data: { paymentStatus: processed ? "REFUNDED" : "REFUND_PENDING" } }),
        this.prisma.auditLog.create({ data: { actor, action: "REFUND_INITIATED", entity: "ORDER", entityId: number, data: { amountPaise: pay.amountPaise, providerRefundId: r.id, status: r.status, reason: reason ?? null } } }),
      ]);
      return { refundId: r.id, status: processed ? "PROCESSED" : "PENDING", amountPaise: pay.amountPaise };
    } catch (e) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } }); // lets staff retry
      this.log.error(`Refund failed for ${number}: ${(e as Error).message}`);
      throw e;
    }
  }

  async refunds(number: string) { const o = await this.prisma.order.findUnique({ where: { number } }); return o ? this.prisma.refund.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "desc" } }) : []; }

  /** Dev only (mock provider): behaves like the provider calling our signed webhook. */
  async mockPay(paymentRef: string, outcome: "success" | "fail") {
    if (!cfg().paymentsMock) throw new AppError("NOT_FOUND", "Not found", 404);
    const p = await this.prisma.payment.findUnique({ where: { providerRef: paymentRef } });
    if (!p) throw new AppError("NOT_FOUND", "Payment not found", 404);
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, type: outcome === "success" ? "payment.captured" : "payment.failed", paymentRef, amountPaise: p.amountPaise });
    return this.orders.webhook(raw, this.orders.sign(raw));
  }
}
