import { describe, expect, it } from "vitest";
import { assertOptions, computeTotals, inclusiveTax, shippingFor } from "./pricing";
const s = { courier: true, local: true, pickup: true as const, codAllowed: true, localFeePaise: 4900 };
describe("pricing", () => {
  it("extracts inclusive GST", () => { expect(inclusiveTax(105000, 500)).toBe(5000); expect(inclusiveTax(112000, 1200)).toBe(12000); });
  it("charges courier below free threshold, free above", () => { expect(shippingFor("COURIER", 150000, s)).toBe(9900); expect(shippingFor("COURIER", 199900, s)).toBe(0); });
  it("pickup is free; local has its own fee", () => { expect(shippingFor("PICKUP", 1, s)).toBe(0); expect(shippingFor("LOCAL", 50000, s)).toBe(4900); expect(shippingFor("LOCAL", 99900, s)).toBe(0); });
  it("COD adds handling fee to total", () => {
    const t = computeTotals([{ unitPricePaise: 100000, quantity: 2, gstRateBps: 500 }], "COURIER", "COD", s);
    expect(t).toMatchObject({ subtotalPaise: 200000, shippingPaise: 0, codFeePaise: 4900, totalPaise: 204900, taxPaise: 9524 });
  });
  it("rejects unserviceable and oversize COD", () => {
    expect(assertOptions("COURIER", "UPI", 1, { ...s, courier: false })).toBe("PINCODE_NOT_SERVICEABLE");
    expect(assertOptions("COURIER", "COD", 2500000, s)).toBe("COD_ORDER_VALUE_TOO_HIGH");
    expect(assertOptions("COURIER", "UPI", 100, s)).toBeNull();
  });
  it("a discount is spread over the lines, tax follows what is paid, and the parts add up", () => {
    const lines = [{ unitPricePaise: 79900, quantity: 2, gstRateBps: 500 }, { unitPricePaise: 459900, quantity: 1, gstRateBps: 1800 }];
    const t = computeTotals(lines, "COURIER", "UPI", s, 50001);
    expect(t.discountPaise).toBe(50001); expect(t.discounts.reduce((a, b) => a + b, 0)).toBe(50001);
    expect(t.subtotalPaise).toBe(79900 * 2 + 459900 - 50001); expect(t.lineTotals.reduce((a, b) => a + b, 0)).toBe(t.subtotalPaise);
    expect(t.totalPaise).toBe(t.subtotalPaise + t.shippingPaise); expect(t.taxPaise).toBe(inclusiveTax(t.lineTotals[0]!, 500) + inclusiveTax(t.lineTotals[1]!, 1800));
  });
  it("free-shipping threshold is judged on the discounted subtotal", () => {
    const l = [{ unitPricePaise: 200000, quantity: 1, gstRateBps: 500 }];
    expect(computeTotals(l, "COURIER", "UPI", s).shippingPaise).toBe(0); expect(computeTotals(l, "COURIER", "UPI", s, 10000).shippingPaise).toBe(9900);
  });
});
