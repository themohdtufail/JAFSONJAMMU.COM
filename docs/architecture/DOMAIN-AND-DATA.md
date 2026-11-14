# Domain Model, Data Ownership & Invariants

Names below describe concepts; verify actual Prisma models/enums before migrations.

## Sources of truth

| Data | Authority |
|---|---|
| Online catalogue and merchandising | JAFSON database |
| Online order and item snapshot | JAFSON database; immutable after placement |
| Online stock reservation | JAFSON reservation ledger |
| Physical POS sales/receipts | Bill OS where business designates it |
| Payment/refund settlement | Provider is external settlement authority; JAFSON stores reconciled state/ledger |
| GST invoice/credit note | JAFSON immutable issued document |
| Staff identity and permissions | JAFSON server-side identity store |
| Shipment/tracking | Courier provider; JAFSON stores normalized state and references |

Business must explicitly decide who owns physical on-hand stock per SKU/location. Two systems cannot independently claim final authority for the same quantity without a reservation protocol.

## Money and pricing invariants

- Store money as integer paise; validate safe integer bounds; never use floating point.
- Persist unit price, discount allocation, taxable base, tax rate/amount, shipping, COD fee and payable snapshot on the order.
- Recalculate all totals server-side.
- Define rounding once and prove allocations sum exactly to order totals.
- Discounts cannot exceed eligible subtotal.
- Refunds cannot exceed captured amount minus successful and reserved pending/unknown refunds.
- Preserve historical commercial snapshots after catalogue changes.

## Inventory invariants

Model on-hand, active reservations, available, and incoming separately. Available is on-hand less active reservations and other explicitly modeled holds.

1. Reserve stock atomically with order placement.
2. Reservation has unique owner/order and explicit expiry/release state.
3. Cancellation, expiry, dispatch, return and adjustment have distinct movement reasons.
4. Movements are immutable; corrections are compensating movements.
5. External sale/receipt/return has stable external ID and unique dedupe key.
6. Duplicate/replayed events cannot mutate stock twice.
7. Concurrent orders cannot reserve more than available.
8. Reconciliation reports drift; controlled adjustment preserves history.
9. SKU mapping is explicit and stable; never map by mutable product name alone.

## Order invariants

Order item snapshots preserve SKU, title, variant/size, unit price, discount, tax, quantity and fulfilment context. Order number is a human-readable reference, never an authorization secret. Ownership is immutable except documented support transfer. State transitions are validated server-side. Payment and fulfilment status are separate dimensions. Cancellation releases only active reservations and is idempotent. Privileged overrides are reason-coded and audited.

## State models

Conceptual order lifecycle:
```text
PENDING_PAYMENT -> CONFIRMED -> PROCESSING -> READY_TO_DISPATCH
       |                |             |                 |
       +-> CANCELLED <--+-------------+                 v
                                                  DISPATCHED
                                                       |
                                                    DELIVERED
                                                       |
                                            PARTIALLY_RETURNED
                                                       |
                                                    RETURNED
```

Payment states: CREATED, PENDING, AUTHORIZED (where applicable), CAPTURED, FAILED (definitive only), UNKNOWN, CANCELLED/EXPIRED (only after safe confirmation). A late verified capture after timeout must trigger documented fulfilment or reversal policy.

Refund states: REQUESTED -> SUBMITTED -> SUCCEEDED; SUBMITTED -> UNKNOWN on ambiguous remote result; UNKNOWN resolves to SUCCEEDED or FAILED only after reconciliation. Unknown/pending refunds reserve refundable capacity. Retry with provider idempotency or reconcile by reference first.

Return states should separate REQUESTED, APPROVED, IN_TRANSIT, RECEIVED, INSPECTED, COMPLETED, REJECTED and CANCELLED. Quantities and disposition are first-class. Shipment states normalize BOOKED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED and exceptions such as FAILED_ATTEMPT, RTO, LOST, CANCELLED.

## Returns: required quantity model

The audit found that return items do not independently enforce quantity and receive logic can restock the full original ordered quantity. Target fields/concepts:
- return request and order-item references;
- requested, approved and received quantities;
- accepted/restockable and rejected/damaged quantities;
- disposition: restock, quarantine, scrap, return-to-vendor, no physical return;
- inspection actor/time/reason;
- inventory movement linkage for each restock;
- refund/exchange linkage.

Invariant: cumulative received/approved quantity across active and completed returns must never exceed eligible fulfilled quantity for the order item. Define precisely how rejected/cancelled requests release quantity. Lock or conditionally update returnable balance and create movement in one transaction. Add DB constraints/uniqueness where possible.

Before migration, reconcile historic return receipts and stock movements. Backfill only quantities supported by source records; otherwise mark for manual review. Never automatically decrement stock to compensate for suspected historical over-restock without approval.

## Refund accounting

Separate refund intent, provider submission, provider outcome and ledger posting. Persist provider refund ID, idempotency key, amount/currency, timestamps, reconciliation time and sanitized failure category. Lock payment/refund aggregate while authorizing a new refund. Unknown/pending amount remains reserved. Never infer success from browser callback or local queue insertion.

## Bill OS stock ownership

Choose per SKU/location:
- POS-mastered: Bill OS owns physical on-hand; JAFSON publishes online reservations so POS available-to-sell excludes them.
- JAFSON-mastered: JAFSON owns ledger and publishes online sales/adjustments to Bill OS.
- Split locations: explicit location ownership and transfer semantics.

Minimum outbound event concepts: reservation requested/confirmed/rejected/released, online dispatch, return receipt where Bill OS owns stock, and reconciliation. Each event requires ID, schema version, aggregate, SKU/location, quantity, timestamp, source, correlation and idempotency. Agree retry, duplicate, out-of-order, offline POS and acknowledgement policy with Bill OS before implementing.

## GST and immutable documents

HSN/GST/place-of-supply classification must be accountant-approved; syntactic validation is not tax correctness. Define treatment of shipping/COD fees and discount allocation. Invoice issuance is immutable; corrections use accountant-approved credit-note/replacement policy. Number allocation must be transactionally unique by financial-year/series. Audit identified possible mismatch between order tax snapshots and invoice allocation of shipping/COD; resolve with accountant and reconciliation tests before filing.

## Customer deletion

Deletion is a workflow: verify identity, revoke sessions, remove/anonymize eligible profile data, retain legally required documents, notify downstream processors, and record completion. A requested flag is not proof of erasure. Define statutory/fraud/dispute retention with legal/accounting review.

## Schema evolution

Use expand/migrate/contract: add compatible fields/tables; deploy dual-read code; backfill in bounded restartable batches; switch writes; verify; remove legacy fields in a later approved migration. Require deterministic migrations, staging validation, backup verification, recovery instructions and explicit production approval.
