import { billOsEventSchema, type BillOsEvent } from "@jafson/validation";

export interface Balance {
  onHand: number;
  reserved: number;
  safetyStock: number;
  version: number;
}

export type MovementType =
  | "SALE" | "SALE_CANCEL" | "RETURN" | "RECEIPT" | "ADJUSTMENT" | "RESERVE" | "RELEASE" | "DISPATCH";

export interface Movement {
  id: number;
  locationId: string;
  variantId: string;
  type: MovementType;
  quantityDelta: number; // change to onHand (reserve/release: change to reserved)
  idempotencyKey: string;
  sourceSystem: string;
  referenceId: string;
}

export type ProcessResult =
  | { status: "APPLIED" }
  | { status: "DUPLICATE" }
  | { status: "QUARANTINED"; reason: "INVALID_SCHEMA" | "UNKNOWN_SKU" | "NEGATIVE_STOCK" | "UNKNOWN_LOCATION"; detail: string };

export class InsufficientStockError extends Error {
  readonly code = "INSUFFICIENT_STOCK";
}

/** Sellable quantity: physical - reserved - safety buffer, never negative. */
export function available(b: Balance): number {
  return Math.max(0, b.onHand - b.reserved - b.safetyStock);
}

const key = (loc: string, v: string) => `${loc}::${v}`;

/**
 * In-memory reference implementation of the ledger rules.
 * The Postgres implementation must reproduce these semantics inside one
 * transaction using guarded UPDATEs (WHERE on_hand - reserved >= qty).
 */
export class InventoryLedger {
  private balances = new Map<string, Balance>();
  private skuToVariant = new Map<string, string>();
  private seen = new Set<string>();
  readonly movements: Movement[] = [];
  readonly quarantine: { event: unknown; reason: string; detail: string }[] = [];

  constructor(private locations: string[]) {}

  mapSku(sku: string, variantId: string) {
    this.skuToVariant.set(sku, variantId);
  }

  balance(loc: string, variantId: string): Balance {
    let b = this.balances.get(key(loc, variantId));
    if (!b) {
      b = { onHand: 0, reserved: 0, safetyStock: 0, version: 0 };
      this.balances.set(key(loc, variantId), b);
    }
    return b;
  }

  private record(loc: string, variantId: string, type: MovementType, delta: number, idem: string, source: string, ref: string) {
    this.movements.push({
      id: this.movements.length + 1, locationId: loc, variantId, type,
      quantityDelta: delta, idempotencyKey: idem, sourceSystem: source, referenceId: ref,
    });
  }

  /** Online order reservation. Fails atomically if any line is short. */
  reserve(loc: string, orderId: string, lines: { variantId: string; quantity: number }[]) {
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new RangeError("quantity must be a positive integer");
      if (available(this.balance(loc, l.variantId)) < l.quantity) throw new InsufficientStockError(l.variantId);
    }
    for (const l of lines) {
      const b = this.balance(loc, l.variantId);
      b.reserved += l.quantity; b.version++;
      this.record(loc, l.variantId, "RESERVE", l.quantity, `reserve:${orderId}:${l.variantId}`, "COMMERCE", orderId);
    }
  }

  release(loc: string, orderId: string, lines: { variantId: string; quantity: number }[]) {
    for (const l of lines) {
      const b = this.balance(loc, l.variantId);
      if (b.reserved < l.quantity) throw new RangeError("releasing more than reserved");
      b.reserved -= l.quantity; b.version++;
      this.record(loc, l.variantId, "RELEASE", -l.quantity, `release:${orderId}:${l.variantId}`, "COMMERCE", orderId);
    }
  }

  /** Dispatch: reserved stock leaves the building. */
  dispatch(loc: string, orderId: string, lines: { variantId: string; quantity: number }[]) {
    for (const l of lines) {
      const b = this.balance(loc, l.variantId);
      if (b.reserved < l.quantity || b.onHand < l.quantity) throw new RangeError("dispatch exceeds reservation");
      b.reserved -= l.quantity; b.onHand -= l.quantity; b.version++;
      this.record(loc, l.variantId, "DISPATCH", -l.quantity, `dispatch:${orderId}:${l.variantId}`, "COMMERCE", orderId);
    }
  }

  /** Idempotent, all-or-nothing processing of one Bill OS event. */
  processBillOsEvent(raw: unknown): ProcessResult {
    const parsed = billOsEventSchema.safeParse(raw);
    if (!parsed.success) return this.quarantined(raw, "INVALID_SCHEMA", parsed.error.message);
    const ev: BillOsEvent = parsed.data;
    if (this.seen.has(ev.event_id)) return { status: "DUPLICATE" };
    if (!this.locations.includes(ev.location_id)) return this.quarantined(raw, "UNKNOWN_LOCATION", ev.location_id);

    const type = { SALE_COMPLETED: "SALE", SALE_CANCELLED: "SALE_CANCEL", SALE_RETURNED: "RETURN", STOCK_RECEIVED: "RECEIPT", STOCK_ADJUSTED: "ADJUSTMENT" }[ev.event_type] as MovementType;
    const sign = ev.event_type === "SALE_COMPLETED" ? -1 : 1;
    const deltas = new Map<string, number>();
    const rows = ev.event_type === "STOCK_ADJUSTED"
      ? ev.event_payload.lines.map((l) => ({ sku: l.sku, d: l.quantity_delta }))
      : ev.event_payload.lines.map((l) => ({ sku: l.sku, d: sign * l.quantity }));

    for (const r of rows) {
      const variantId = this.skuToVariant.get(r.sku);
      if (!variantId) return this.quarantined(raw, "UNKNOWN_SKU", r.sku);
      deltas.set(variantId, (deltas.get(variantId) ?? 0) + r.d);
    }
    // Validate everything before mutating anything (atomicity).
    for (const [variantId, d] of deltas) {
      if (this.balance(ev.location_id, variantId).onHand + d < 0) return this.quarantined(raw, "NEGATIVE_STOCK", variantId);
    }
    for (const [variantId, d] of deltas) {
      const b = this.balance(ev.location_id, variantId);
      b.onHand += d; b.version++;
      this.record(ev.location_id, variantId, type, d, ev.event_id, ev.source_system, ev.source_transaction_id);
    }
    this.seen.add(ev.event_id);
    return { status: "APPLIED" };
  }

  /** Compare a Bill OS stock snapshot to the ledger; returns discrepancies. */
  reconcile(loc: string, snapshot: { sku: string; quantity: number }[]) {
    const out: { sku: string; ledger: number; reported: number }[] = [];
    for (const s of snapshot) {
      const v = this.skuToVariant.get(s.sku);
      const ledger = v ? this.balance(loc, v).onHand : 0;
      if (!v || ledger !== s.quantity) out.push({ sku: s.sku, ledger, reported: s.quantity });
    }
    return out;
  }

  private quarantined(event: unknown, reason: Extract<ProcessResult, { status: "QUARANTINED" }>["reason"], detail: string): ProcessResult {
    this.quarantine.push({ event, reason, detail });
    return { status: "QUARANTINED", reason, detail };
  }
}
