import { describe, expect, it } from "vitest";
import { evaluateCoupon, normaliseCode, type CouponRule } from "./coupons";

const base: CouponRule = { code: "WELCOME10", kind: "PERCENT", value: 1000, minSubtotalPaise: 100000, maxDiscountPaise: 50000, startsAt: null, endsAt: null, usageLimit: null, perPhoneLimit: 1, isActive: true };
const now = new Date("2026-11-14T10:00:00Z"), none = { total: 0, byPhone: 0 };

describe("coupons", () => {
  it("percent discount is floored and capped", () => {
    expect(evaluateCoupon(base, 123456, now, none)).toEqual({ ok: true, discountPaise: 12345 });
    expect(evaluateCoupon(base, 900000, now, none)).toEqual({ ok: true, discountPaise: 50000 });
  });
  it("flat discount never takes the price below one rupee", () => {
    const flat = { ...base, kind: "FLAT" as const, value: 300000, maxDiscountPaise: null, minSubtotalPaise: 0 };
    expect(evaluateCoupon(flat, 250000, now, none)).toEqual({ ok: true, discountPaise: 249900 });
    expect(evaluateCoupon(flat, 90, now, none)).toMatchObject({ ok: false });
  });
  it("explains why a coupon does not apply", () => {
    expect(evaluateCoupon({ ...base, isActive: false }, 200000, now, none)).toMatchObject({ code: "COUPON_INACTIVE" });
    expect(evaluateCoupon({ ...base, startsAt: new Date("2026-12-01") }, 200000, now, none)).toMatchObject({ code: "COUPON_NOT_STARTED" });
    expect(evaluateCoupon({ ...base, endsAt: new Date("2026-11-01") }, 200000, now, none)).toMatchObject({ code: "COUPON_EXPIRED" });
    expect(evaluateCoupon(base, 99999, now, none)).toEqual({ ok: false, code: "COUPON_MIN_NOT_MET", minSubtotalPaise: 100000 });
    expect(evaluateCoupon({ ...base, usageLimit: 5 }, 200000, now, { total: 5, byPhone: 0 })).toMatchObject({ code: "COUPON_EXHAUSTED" });
    expect(evaluateCoupon(base, 200000, now, { total: 1, byPhone: 1 })).toMatchObject({ code: "COUPON_ALREADY_USED" });
    expect(evaluateCoupon({ ...base, perPhoneLimit: 2 }, 200000, now, { total: 1, byPhone: 1 })).toMatchObject({ ok: true });
  });
  it("normalises typed codes", () => { expect(normaliseCode("  welcome 10 ")).toBe("WELCOME10"); });
});
