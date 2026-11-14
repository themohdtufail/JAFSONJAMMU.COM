/**
 * GST rules as pure functions (no database), so every figure on an invoice can be unit-tested.
 * Prices in this system are tax-inclusive paise. All amounts are integer paise.
 */

export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar",
  "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const ALIASES: Record<string, string> = { "j and k": "01", jk: "01", "jammu kashmir": "01", "new delhi": "07", "nct of delhi": "07", "delhi nct": "07", orissa: "21", uttaranchal: "05", pondicherry: "34", "andaman nicobar islands": "35", "andaman and nicobar": "35", "dadra and nagar haveli": "26", "daman and diu": "26", "dadra nagar haveli": "26" };
const BY_NAME = new Map<string, string>([...Object.entries(STATES).map(([c, n]) => [norm(n), c] as [string, string]), ...Object.entries(ALIASES)]);
/** State or UT name (any common spelling) to its GST state code, or null if it isn't recognised. */
export const stateCode = (name: string | undefined | null) => (name ? BY_NAME.get(norm(name)) ?? null : null);
export const stateName = (code: string) => STATES[code] ?? null;
export const STATE_NAMES = Object.entries(STATES).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));

/** GSTIN: 2-digit state code, 10-char PAN, entity number, 'Z', check character (mod-36 checksum). */
const CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) { const v = CH.indexOf(first14[i]!); const p = v * (i % 2 === 0 ? 1 : 2); sum += Math.floor(p / 36) + (p % 36); }
  return CH[(36 - (sum % 36)) % 36]!;
}
export function validGstin(g: string | undefined | null) {
  if (!g) return false; const s = g.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  return !!STATES[s.slice(0, 2)] && gstinCheckChar(s.slice(0, 14)) === s[14];
}

/** GST contained in a tax-inclusive amount. */
export const inclusiveTax = (grossPaise: number, rateBps: number) => grossPaise - Math.round((grossPaise * 10000) / (10000 + rateBps));

/** Split GST by the kind of supply: within the seller's state it is CGST + SGST (half each), between states it is IGST. */
export function splitTax(taxPaise: number, supply: "INTRA" | "INTER") {
  if (supply === "INTER") return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgstPaise = Math.floor(taxPaise / 2); return { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
}
export const supplyType = (sellerCode: string, placeOfSupplyCode: string): "INTRA" | "INTER" => (sellerCode === placeOfSupplyCode ? "INTRA" : "INTER");

/** Spread a total over weights in whole paise (largest remainder), so the parts always add up exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum), base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) { if (left <= 0) break; if (weights[o.i]! > 0) { base[o.i]!++; left--; } }
  return base;
}

export interface SourceItem { orderItemId: string; sku: string; name: string; variant: string; hsn: string; quantity: number; unitPricePaise: number; rateBps: number }
export interface DocLine { orderItemId: string; sku: string; name: string; variant: string; hsn: string; quantity: number; rateBps: number; unitPricePaise?: number; itemGrossPaise?: number; feeGrossPaise?: number; grossPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }

/**
 * Invoice lines. Delivery charges and the cash-on-delivery fee are part of the same supply of goods, so they are
 * apportioned over the items by value and taxed at each item's rate (composite supply). Taxable values and tax then add up exactly to the order total.
 */
export function buildInvoiceLines(items: SourceItem[], deliveryPaise: number, codFeePaise: number, supply: "INTRA" | "INTER"): DocLine[] {
  const itemGross = items.map((i) => i.unitPricePaise * i.quantity);
  const fees = allocate(deliveryPaise + codFeePaise, itemGross);
  return items.map((it, k) => {
    const gross = itemGross[k]! + fees[k]!, tax = inclusiveTax(gross, it.rateBps);
    return { orderItemId: it.orderItemId, sku: it.sku, name: it.name, variant: it.variant, hsn: it.hsn, quantity: it.quantity, rateBps: it.rateBps, unitPricePaise: it.unitPricePaise, itemGrossPaise: itemGross[k]!, feeGrossPaise: fees[k]!, grossPaise: gross, taxablePaise: gross - tax, ...splitTax(tax, supply) };
  });
}

export const lineTax = (l: { cgstPaise: number; sgstPaise: number; igstPaise: number }) => l.cgstPaise + l.sgstPaise + l.igstPaise;
export function totalsOf(lines: DocLine[]) {
  const t = lines.reduce((a, l) => ({ taxablePaise: a.taxablePaise + l.taxablePaise, cgstPaise: a.cgstPaise + l.cgstPaise, sgstPaise: a.sgstPaise + l.sgstPaise, igstPaise: a.igstPaise + l.igstPaise, grossPaise: a.grossPaise + l.grossPaise }), { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, grossPaise: 0 });
  return { ...t, taxPaise: t.cgstPaise + t.sgstPaise + t.igstPaise };
}

/**
 * Credit note lines for a refund. `remaining` is what is still creditable per invoice line (gross and tax).
 * Amount is spread over the chosen lines in proportion to what remains on them; a line credited in full reverses its tax exactly.
 */
export function buildCreditLines(invoiceLines: DocLine[], priorCredits: DocLine[], supply: "INTRA" | "INTER", amountPaise: number | null, onlyItemIds?: string[]): DocLine[] {
  const prior = (id: string) => priorCredits.filter((c) => c.orderItemId === id).reduce((a, c) => ({ gross: a.gross + c.grossPaise, tax: a.tax + lineTax(c) }), { gross: 0, tax: 0 });
  const rows = invoiceLines.filter((l) => !onlyItemIds || onlyItemIds.includes(l.orderItemId)).map((l) => { const p = prior(l.orderItemId); return { l, remGross: l.grossPaise - p.gross, remTax: lineTax(l) - p.tax }; }).filter((r) => r.remGross > 0);
  const creditable = rows.reduce((n, r) => n + r.remGross, 0);
  const amount = amountPaise ?? creditable;
  if (amount <= 0) throw new RangeError("Nothing left to credit");
  if (amount > creditable) throw new RangeError("Credit exceeds what remains on the invoice");
  const parts = allocate(amount, rows.map((r) => r.remGross));
  return rows.map((r, i) => {
    const gross = parts[i]!; const tax = gross === r.remGross ? r.remTax : Math.min(inclusiveTax(gross, r.l.rateBps), r.remTax);
    return { orderItemId: r.l.orderItemId, sku: r.l.sku, name: r.l.name, variant: r.l.variant, hsn: r.l.hsn, quantity: 0, rateBps: r.l.rateBps, grossPaise: gross, taxablePaise: gross - tax, ...splitTax(tax, supply) };
  }).filter((l) => l.grossPaise > 0);
}

/** Indian financial year (1 April to 31 March) in India time, e.g. "2026-27". */
export function financialYear(d: Date) {
  const ist = new Date(d.getTime() + 5.5 * 3600_000); const y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1; const s = m >= 4 ? y : y - 1;
  return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
}
/** Consecutive serial numbers per financial year; Rule 46 allows 16 characters of letters, digits, hyphen and slash. */
export const documentNumber = (prefix: "JF" | "CN", fy: string, n: number) => `${prefix}/${fy.slice(2)}/${String(n).padStart(6, "0")}`;

/** Suggested GST rate for garments by sale value per piece. A suggestion only: the rate on each product is set and confirmed by the company's accountant. */
export const suggestedRateBps = (unitPricePaise: number) => (unitPricePaise <= 250000 ? 500 : 1800);

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n]! : TENS[Math.floor(n / 10)]! + (n % 10 ? " " + ONES[n % 10] : ""));
const below1000 = (n: number) => (n >= 100 ? ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + below100(n % 100) : "") : below100(n));
/** "Rupees one thousand two hundred and fifty only", with Indian grouping (lakh, crore). */
export function amountInWords(paise: number) {
  let r = Math.floor(paise / 100); const p = paise % 100; if (r === 0 && p === 0) return "Rupees zero only";
  const parts: string[] = []; const cr = Math.floor(r / 1e7); r %= 1e7; const lk = Math.floor(r / 1e5); r %= 1e5; const th = Math.floor(r / 1e3); r %= 1e3;
  if (cr) parts.push(below1000(cr) + " crore"); if (lk) parts.push(below100(lk) + " lakh"); if (th) parts.push(below100(th) + " thousand"); if (r) parts.push(below1000(r));
  let words = parts.join(" "); if (words.includes(" hundred") === false && false) words = words;
  const text = words ? `Rupees ${words}` : "Rupees zero"; const ps = p ? ` and ${below100(p)} paise` : "";
  return (text + ps + " only").replace(/^./, (c) => c.toUpperCase());
}
