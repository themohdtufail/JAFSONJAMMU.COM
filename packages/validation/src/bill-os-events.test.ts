import { describe, expect, it } from "vitest";
import { billOsEventSchema } from "./bill-os-events";

const ok = {
  event_id: "6f1c2a52-8f0e-4c1e-9b0e-1a2b3c4d5e6f",
  event_type: "SALE_COMPLETED",
  source_system: "BILL_OS",
  source_transaction_id: "INV-1",
  location_id: "JAFSON_JAMMU_SHOWROOM",
  occurred_at: "2026-11-10T10:00:00Z",
  schema_version: 1,
  event_payload: { lines: [{ sku: "JK-001-M", quantity: 1 }] },
};

describe("billOsEventSchema", () => {
  it("accepts a valid sale", () => expect(billOsEventSchema.safeParse(ok).success).toBe(true));
  it("rejects zero quantity", () =>
    expect(billOsEventSchema.safeParse({ ...ok, event_payload: { lines: [{ sku: "A", quantity: 0 }] } }).success).toBe(false));
  it("rejects unknown schema version", () =>
    expect(billOsEventSchema.safeParse({ ...ok, schema_version: 2 }).success).toBe(false));
  it("accepts a transfer and a snapshot, and rejects a snapshot with a negative count", () => {
    expect(billOsEventSchema.safeParse({ ...ok, event_type: "STOCK_TRANSFERRED", event_payload: { to_location_id: "WAREHOUSE", lines: [{ sku: "A", quantity: 2 }] } }).success).toBe(true);
    expect(billOsEventSchema.safeParse({ ...ok, event_type: "STOCK_TRANSFERRED", event_payload: { lines: [{ sku: "A", quantity: 2 }] } }).success).toBe(false);
    expect(billOsEventSchema.safeParse({ ...ok, event_type: "STOCK_SNAPSHOT_SUBMITTED", event_payload: { lines: [{ sku: "A", quantity: 0 }] } }).success).toBe(true);
    expect(billOsEventSchema.safeParse({ ...ok, event_type: "STOCK_SNAPSHOT_SUBMITTED", event_payload: { lines: [{ sku: "A", quantity: -1 }] } }).success).toBe(false);
  });
});
