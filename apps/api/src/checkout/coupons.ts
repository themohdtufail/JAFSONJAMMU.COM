/** Coupon rules as pure functions. Amounts are integer paise; prices are tax-inclusive, so a discount is a reduction of the price paid. */
export interface CouponRule { code: string; kind: "PERCENT" | "FLAT"; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; perPhoneLimit: number; isActive: boolean }
export type CouponProblem = "COUPON_INACTIVE" | "COUPON_NOT_STARTED" | "COUPON_EXPIRED" | "COUPON_MIN_NOT_MET" | "COUPON_EXHAUSTED" | "COUPON_ALREADY_USED";
export type CouponResult = { ok: true; discountPaise: number } | { ok: false; code: CouponProblem; minSubtotalPaise?: number };

export const normaliseCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

/** `usage` counts live redemptions (not released by a cancelled or expired order). */
export function evaluateCoupon(c: CouponRule, subtotalPaise: number, now: Date, usage: { total: number; byPhone: number }): CouponResult {
  if (!c.isActive) return { ok: false, code: "COUPON_INACTIVE" };
  if (c.startsAt && now < c.startsAt) return { ok: false, code: "COUPON_NOT_STARTED" };
  if (c.endsAt && now > c.endsAt) return { ok: false, code: "COUPON_EXPIRED" };
  if (subtotalPaise < c.minSubtotalPaise) return { ok: false, code: "COUPON_MIN_NOT_MET", minSubtotalPaise: c.minSubtotalPaise };
  if (c.usageLimit !== null && usage.total >= c.usageLimit) return { ok: false, code: "COUPON_EXHAUSTED" };
  if (usage.byPhone >= c.perPhoneLimit) return { ok: false, code: "COUPON_ALREADY_USED" };
  let d = c.kind === "PERCENT" ? Math.floor((subtotalPaise * c.value) / 10000) : c.value;
  if (c.maxDiscountPaise !== null) d = Math.min(d, c.maxDiscountPaise);
  d = Math.min(d, Math.max(0, subtotalPaise - 100)); // the customer always pays at least one rupee for goods
  return d > 0 ? { ok: true, discountPaise: d } : { ok: false, code: "COUPON_MIN_NOT_MET" };
}
