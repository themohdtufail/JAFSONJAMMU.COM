import { describe, expect, it } from "vitest";
import { allocate, amountInWords, buildCreditLines, buildInvoiceLines, documentNumber, financialYear, gstinCheckChar, inclusiveTax, lineTax, splitTax, stateCode, supplyType, suggestedRateBps, totalsOf, validGstin, type SourceItem } from "./gst";

const item = (id: string, price: number, qty: number, rate: number): SourceItem => ({ orderItemId: id, sku: id, name: id, variant: "x", hsn: "6109", quantity: qty, unitPricePaise: price, rateBps: rate });

describe("states and GSTIN", () => {
  it("maps common spellings to GST state codes", () => {
    expect(stateCode("Jammu & Kashmir")).toBe("01"); expect(stateCode("jammu and kashmir")).toBe("01"); expect(stateCode("J&K")).toBe("01"); expect(stateCode("New Delhi")).toBe("07"); expect(stateCode("Orissa")).toBe("21"); expect(stateCode("Maharashtra")).toBe("27"); expect(stateCode("Ladakh")).toBe("38");
    expect(stateCode("Narnia")).toBeNull(); expect(stateCode("")).toBeNull(); expect(stateCode(undefined)).toBeNull();
  });
  it("validates GSTIN format and checksum", () => {
    const base = "27AAPFU0939F1Z"; const good = base + gstinCheckChar(base); expect(validGstin(good)).toBe(true); expect(validGstin(good.toLowerCase())).toBe(true);
    const bad = base + (gstinCheckChar(base) === "A" ? "B" : "A"); expect(validGstin(bad)).toBe(false);
    expect(validGstin("27AAPFU0939F1Z")).toBe(false); expect(validGstin("99AAPFU0939F1Z0")).toBe(false); expect(validGstin("")).toBe(false); expect(validGstin(null)).toBe(false);
    const j = "01ABCDE1234F1Z"; expect(validGstin(j + gstinCheckChar(j))).toBe(true);
  });
});

describe("tax arithmetic", () => {
  it("extracts GST from tax-inclusive prices", () => { expect(inclusiveTax(105000, 500)).toBe(5000); expect(inclusiveTax(118000, 1800)).toBe(18000); expect(inclusiveTax(0, 500)).toBe(0); });
  it("splits CGST and SGST for supplies inside the state and uses IGST between states, never losing a paisa", () => {
    expect(splitTax(101, "INTRA")).toEqual({ cgstPaise: 50, sgstPaise: 51, igstPaise: 0 }); expect(splitTax(100, "INTRA")).toEqual({ cgstPaise: 50, sgstPaise: 50, igstPaise: 0 }); expect(splitTax(101, "INTER")).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 101 });
    expect(supplyType("01", "01")).toBe("INTRA"); expect(supplyType("01", "07")).toBe("INTER");
  });
  it("allocates amounts in whole paise that always sum exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]); expect(allocate(0, [5, 5])).toEqual([0, 0]); expect(allocate(7, [0, 0])).toEqual([0, 0]);
    for (let n = 0; n < 200; n++) { const w = [3, 7, 11, 13].map((x) => x * (1 + (n % 5))); expect(allocate(n * 37, w).reduce((a, b) => a + b, 0)).toBe(n * 37); }
  });
  it("builds invoice lines whose taxable value plus tax equals the order total, with delivery and COD fee folded in", () => {
    const items = [item("a", 79900, 2, 500), item("b", 459900, 1, 1800)];
    const lines = buildInvoiceLines(items, 9900, 4900, "INTRA"); const t = totalsOf(lines);
    expect(t.grossPaise).toBe(79900 * 2 + 459900 + 9900 + 4900); expect(t.taxablePaise + t.taxPaise).toBe(t.grossPaise);
    for (const l of lines) { expect(l.taxablePaise + lineTax(l)).toBe(l.grossPaise); expect(l.cgstPaise - l.sgstPaise).toBeLessThanOrEqual(0); expect(l.igstPaise).toBe(0); }
    expect(lines[0]!.feeGrossPaise! + lines[1]!.feeGrossPaise!).toBe(14800); expect(lines[1]!.rateBps).toBe(1800);
    const inter = buildInvoiceLines(items, 9900, 0, "INTER"); expect(totalsOf(inter).cgstPaise).toBe(0); expect(totalsOf(inter).igstPaise).toBe(totalsOf(buildInvoiceLines(items, 9900, 0, "INTRA")).taxPaise);
  });
  it("handles free delivery and a single item", () => { const l = buildInvoiceLines([item("a", 100000, 1, 500)], 0, 0, "INTRA"); expect(l[0]!.grossPaise).toBe(100000); expect(totalsOf(l).taxPaise).toBe(4762); });
});

describe("credit notes", () => {
  const inv = () => buildInvoiceLines([item("a", 79900, 2, 500), item("b", 459900, 1, 1800)], 9900, 4900, "INTRA");
  it("credits a partial amount in proportion and never beyond what remains", () => {
    const lines = inv(); const c = buildCreditLines(lines, [], "INTRA", 100000); expect(c.reduce((n, l) => n + l.grossPaise, 0)).toBe(100000); for (const l of c) expect(l.taxablePaise + lineTax(l)).toBe(l.grossPaise);
    expect(() => buildCreditLines(lines, [], "INTRA", totalsOf(lines).grossPaise + 1)).toThrow(RangeError); expect(() => buildCreditLines(lines, [], "INTRA", 0)).toThrow();
  });
  it("targets specific items and reverses their tax exactly when credited in full", () => {
    const lines = inv(); const c = buildCreditLines(lines, [], "INTRA", null, ["b"]); expect(c).toHaveLength(1); expect(c[0]!.grossPaise).toBe(lines[1]!.grossPaise); expect(lineTax(c[0]!)).toBe(lineTax(lines[1]!)); expect(c[0]!.taxablePaise).toBe(lines[1]!.taxablePaise);
  });
  it("cumulative credits across several notes add back to the invoice exactly", () => {
    const lines = inv(); const total = totalsOf(lines); const prior: ReturnType<typeof buildCreditLines> = [];
    for (const amt of [33333, 77777, 123457]) prior.push(...buildCreditLines(lines, prior, "INTRA", amt));
    prior.push(...buildCreditLines(lines, prior, "INTRA", null)); // the rest
    const sum = totalsOf(prior); expect(sum.grossPaise).toBe(total.grossPaise); expect(sum.taxablePaise).toBe(total.taxablePaise); expect(sum.taxPaise).toBe(total.taxPaise);
    expect(() => buildCreditLines(lines, prior, "INTRA", 100)).toThrow(RangeError);
  });
});

describe("numbering, years and words", () => {
  it("uses the Indian financial year in India time", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2026-27"); expect(financialYear(new Date("2026-03-31T23:59:00+05:30"))).toBe("2025-26"); expect(financialYear(new Date("2026-11-14T10:00:00Z"))).toBe("2026-27"); expect(financialYear(new Date("2026-03-31T20:00:00Z"))).toBe("2026-27"); // 1 April in India
  });
  it("makes document numbers within the 16-character rule", () => { expect(documentNumber("JF", "2026-27", 1)).toBe("JF/26-27/000001"); expect(documentNumber("CN", "2026-27", 123456)).toBe("CN/26-27/123456"); expect(documentNumber("JF", "2026-27", 1).length).toBeLessThanOrEqual(16); });
  it("suggests a rate slab by price per piece (a suggestion for the accountant to confirm)", () => { expect(suggestedRateBps(249900)).toBe(500); expect(suggestedRateBps(250000)).toBe(500); expect(suggestedRateBps(250001)).toBe(1800); });
  it("writes amounts in words with Indian grouping", () => {
    expect(amountInWords(125000)).toBe("Rupees one thousand two hundred fifty only"); expect(amountInWords(459900)).toBe("Rupees four thousand five hundred ninety nine only"); expect(amountInWords(12500000)).toBe("Rupees one lakh twenty five thousand only"); expect(amountInWords(10000000 * 100 * 10 + 5)).toBe("Rupees ten crore and five paise only"); expect(amountInWords(0)).toBe("Rupees zero only"); expect(amountInWords(99)).toBe("Rupees zero and ninety nine paise only");
  });
});

describe("state list", () => { it("is sorted by name for the checkout dropdown", async () => { const { STATE_NAMES } = await import("./gst"); const n = STATE_NAMES.map((s) => s.name); expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b))); expect(n).toContain("Jammu and Kashmir"); }); });
