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
});
