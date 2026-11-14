import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, Tx } from "../common/prisma.service";
import { AppError } from "../common/http";
import { evaluateCoupon, normaliseCode, type CouponProblem } from "./coupons";

export const COUPON_MESSAGES: Record<string, string> = {
  COUPON_INVALID: "That code isn't valid.", COUPON_INACTIVE: "That code isn't active.", COUPON_NOT_STARTED: "That code isn't active yet.", COUPON_EXPIRED: "That code has expired.",
  COUPON_MIN_NOT_MET: "Your order is below the minimum for this code.", COUPON_EXHAUSTED: "That code has been fully used.", COUPON_ALREADY_USED: "You've already used this code.",
};
export type Check = { ok: true; couponId: string; code: string; description: string; discountPaise: number } | { ok: false; code: CouponProblem | "COUPON_INVALID"; minSubtotalPaise?: number };

@Injectable()
export class CouponsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /** Evaluates a typed code against a subtotal. Pass the phone to enforce the per-customer limit (known at checkout, not when browsing). */
  async check(db: Tx | PrismaService, typed: string, subtotalPaise: number, phone?: string): Promise<Check> {
    const c = await db.coupon.findUnique({ where: { code: normaliseCode(typed) } });
    if (!c) return { ok: false, code: "COUPON_INVALID" };
    const [total, byPhone] = await Promise.all([db.couponRedemption.count({ where: { couponId: c.id, releasedAt: null } }), phone ? db.couponRedemption.count({ where: { couponId: c.id, phone, releasedAt: null } }) : 0]);
    const r = evaluateCoupon({ ...c, kind: c.kind as "PERCENT" | "FLAT" }, subtotalPaise, new Date(), { total, byPhone });
    return r.ok ? { ok: true, couponId: c.id, code: c.code, description: c.description, discountPaise: r.discountPaise } : { ok: false, code: r.code, minSubtotalPaise: r.minSubtotalPaise };
  }

  /** Inside the order transaction: lock the coupon so two orders cannot both take its last use, then re-check and record the redemption. */
  async redeem(tx: Tx, typed: string, subtotalPaise: number, phone: string, orderId: string, expectedDiscount: number) {
    const c = await tx.coupon.findUnique({ where: { code: normaliseCode(typed) } });
    if (!c) throw new AppError("COUPON_INVALID", COUPON_MESSAGES.COUPON_INVALID!, 422);
    await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${c.id}::uuid FOR UPDATE`;
    const k = await this.check(tx, typed, subtotalPaise, phone);
    if (!k.ok) throw new AppError(k.code, COUPON_MESSAGES[k.code] ?? "That code can't be used.", 422);
    if (k.discountPaise !== expectedDiscount) throw new AppError("COUPON_CHANGED", "The discount changed while you were checking out. Review your order and try again.", 409);
    await tx.couponRedemption.create({ data: { couponId: c.id, orderId, phone, discountPaise: k.discountPaise } });
  }

  /** The order was cancelled or expired: give the use back. The row stays as history. */
  async release(tx: Tx, orderId: string) { await tx.couponRedemption.updateMany({ where: { orderId, releasedAt: null }, data: { releasedAt: new Date() } }); }
}
