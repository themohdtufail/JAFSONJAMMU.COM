import { describe, expect, it } from "vitest";
import { InventoryLedger, InsufficientStockError, available } from "./ledger";

const LOC = "JAFSON_JAMMU_SHOWROOM";
let n = 0;
const ev = (type: string, qty: number, sku = "JK-M", id?: string) => ({
  event_id: id ?? `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  event_type: type, source_system: "BILL_OS", source_transaction_id: `T${n}`,
  location_id: LOC, occurred_at: "2026-11-10T10:00:00Z", schema_version: 1,
  event_payload: { lines: [{ sku, quantity: qty }] },
});

function setup(stock = 10) {
  const l = new InventoryLedger([LOC]);
  l.mapSku("JK-M", "v1");
  l.processBillOsEvent(ev("STOCK_RECEIVED", stock));
  return l;
}

describe("spec §4.4 worked example", () => {
  it("10 -> reserve 2 -> showroom sells 3 -> dispatch", () => {
    const l = setup(10);
    l.reserve(LOC, "o1", [{ variantId: "v1", quantity: 2 }]);
    expect(available(l.balance(LOC, "v1"))).toBe(8);
    l.processBillOsEvent(ev("SALE_COMPLETED", 3));
    const b = l.balance(LOC, "v1");
    expect([b.onHand, b.reserved, available(b)]).toEqual([7, 2, 5]);
    l.dispatch(LOC, "o1", [{ variantId: "v1", quantity: 2 }]);
    expect([b.onHand, b.reserved, available(b)]).toEqual([5, 0, 5]);
  });
});

describe("idempotency & quarantine", () => {
  it("duplicate event never deducts twice", () => {
    const l = setup(10);
    const e = ev("SALE_COMPLETED", 3);
    expect(l.processBillOsEvent(e).status).toBe("APPLIED");
    expect(l.processBillOsEvent(e).status).toBe("DUPLICATE");
    expect(l.balance(LOC, "v1").onHand).toBe(7);
  });
  it("unknown SKU is quarantined, not dropped", () => {
    const l = setup(10);
    expect(l.processBillOsEvent(ev("SALE_COMPLETED", 1, "NOPE"))).toMatchObject({ status: "QUARANTINED", reason: "UNKNOWN_SKU" });
    expect(l.quarantine).toHaveLength(1);
  });
  it("sale that would go negative is quarantined and leaves balance intact", () => {
    const l = setup(2);
    expect(l.processBillOsEvent(ev("SALE_COMPLETED", 5))).toMatchObject({ reason: "NEGATIVE_STOCK" });
    expect(l.balance(LOC, "v1").onHand).toBe(2);
  });
  it("offline replay with same event_id after sync is a no-op", () => {
    const l = setup(10);
    const e = ev("SALE_COMPLETED", 1);
    for (let i = 0; i < 5; i++) l.processBillOsEvent(e);
    expect(l.balance(LOC, "v1").onHand).toBe(9);
  });
});

describe("no overselling", () => {
  it("last unit can be reserved only once", () => {
    const l = setup(1);
    l.reserve(LOC, "a", [{ variantId: "v1", quantity: 1 }]);
    expect(() => l.reserve(LOC, "b", [{ variantId: "v1", quantity: 1 }])).toThrow(InsufficientStockError);
  });
  it("safety stock is not sellable online", () => {
    const l = setup(3);
    l.balance(LOC, "v1").safetyStock = 2;
    expect(() => l.reserve(LOC, "a", [{ variantId: "v1", quantity: 2 }])).toThrow(InsufficientStockError);
  });
  it("multi-line reservation is all-or-nothing", () => {
    const l = setup(5); l.mapSku("X", "v2");
    expect(() => l.reserve(LOC, "a", [{ variantId: "v1", quantity: 1 }, { variantId: "v2", quantity: 1 }])).toThrow();
    expect(l.balance(LOC, "v1").reserved).toBe(0);
  });
});

describe("reconciliation", () => {
  it("reports discrepancies", () => {
    const l = setup(10);
    expect(l.reconcile(LOC, [{ sku: "JK-M", quantity: 9 }, { sku: "??", quantity: 1 }])).toEqual([
      { sku: "JK-M", ledger: 10, reported: 9 }, { sku: "??", ledger: 0, reported: 1 },
    ]);
  });
});
