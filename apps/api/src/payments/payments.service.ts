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
    await this.prisma.refund.update({ where: { id: row.id }, data: { status: ok ? "PROCESSED" : "FAILED" } });
    await this.syncPaymentStatus(row.orderId, row.paymentId);
    return { status: ok ? "REFUND_PROCESSED" : "REFUND_FAILED" };
  }

  /** Order payment status follows the refund ledger: nothing, some or all of the captured amount returned. */
  private async syncPaymentStatus(orderId: string, paymentId: string) {
    const pay = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const rs = await this.prisma.refund.findMany({ where: { paymentId } });
    const done = rs.filter((r) => r.status === "PROCESSED").reduce((n, r) => n + r.amountPaise, 0);
    const pending = rs.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.amountPaise, 0);
    const status = done >= pay.amountPaise ? "REFUNDED" : pending > 0 ? "REFUND_PENDING" : done > 0 ? "PARTIALLY_REFUNDED" : null;
    if (status) await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
  }

  /**
   * Refunds the captured online payment, in full or in part. The sum of live refunds can never exceed what was captured:
   * the check runs under a row lock, so two staff clicking at once cannot both succeed. Cash-on-delivery orders are refunded manually.
   */
  async refund(number: string, reason: string | undefined, actor: string, amountPaise?: number) {
    const o = await this.prisma.order.findUnique({ where: { number } });
    if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    if (!["CANCELLED", "DELIVERED", "COLLECTED"].includes(o.status) && !["REFUND_DUE", "REFUND_PENDING"].includes(o.paymentStatus)) throw new AppError("ORDER_ACTIVE", "This order is still being fulfilled. Cancel it first, or refund after delivery.", 409);
    const pay = await this.prisma.payment.findFirst({ where: { orderId: o.id, status: "CAPTURED" } });
    if (!pay || (!pay.providerPaymentId && pay.provider === "RAZORPAY")) throw new AppError("NOT_REFUNDABLE_ONLINE", "There is no captured online payment on this order. Refund it manually and mark it done.", 409);
    const provider = getProvider();
    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${pay.id}::uuid FOR UPDATE`;
      const live = await tx.refund.aggregate({ where: { paymentId: pay.id, status: { in: ["PENDING", "PROCESSED"] } }, _sum: { amountPaise: true } });
      const remaining = pay.amountPaise - (live._sum.amountPaise ?? 0);
      if (remaining <= 0) throw new AppError("ALREADY_REFUNDED", "This payment has already been fully refunded.", 409);
      const amt = amountPaise ?? remaining;
      if (!Number.isInteger(amt) || amt < 100) throw new AppError("INVALID_AMOUNT", "Enter a refund amount of at least ₹1.", 422);
      if (amt > remaining) throw new AppError("REFUND_EXCEEDS_PAYMENT", `Only ${(remaining / 100).toLocaleString("en-IN")} rupees can still be refunded on this payment.`, 409, { remainingPaise: remaining });
      return tx.refund.create({ data: { orderId: o.id, paymentId: pay.id, amountPaise: amt, reason, actor } });
    });
    let r: { id: string; status: string };
    try {
      r = await provider.refund(pay.providerPaymentId ?? pay.providerRef, refund.amountPaise, { order: o.number, refund: refund.id });
    } catch (e) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } }); // the provider refused, so nothing moved: free the amount for a retry
      this.log.error(`Refund failed for ${number}: ${(e as Error).message}`);
      throw e;
    }
    // From here the money HAS moved. Never mark this refund failed or free its amount, or staff could refund twice.
    try {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { providerRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" } });
      await this.syncPaymentStatus(o.id, pay.id);
      await this.prisma.auditLog.create({ data: { actor, action: "REFUND_INITIATED", entity: "ORDER", entityId: number, data: { amountPaise: refund.amountPaise, providerRefundId: r.id, status: r.status, reason: reason ?? null } } });
    } catch (e) {
      this.log.error(`REFUND SENT BUT NOT RECORDED order=${number} refund=${refund.id} provider=${r.id}: ${(e as Error).message}`);
      throw new AppError("REFUND_NOT_RECORDED", "The refund was sent to the payment provider but could not be saved here. Do not retry. Check the provider dashboard and tell engineering.", 500, { providerRefundId: r.id });
    }
    return { refundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING", amountPaise: refund.amountPaise };
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
