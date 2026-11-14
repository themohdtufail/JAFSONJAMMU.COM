# Implementation Roadmap & Acceptance Criteria

Sequence work to reduce risk. Reinspect current source before each package. Use focused feature branches and PRs. This roadmap is not authorization to deploy, migrate production, release or bump versions.

## Phase 0 — Reconfirm baseline

Record current branch/commit and drift from audit snapshot. Inventory controllers, services, Prisma models/migrations, scripts, env vars, providers, CI and deployment. Trace checkout -> order -> payment -> fulfilment -> return/refund and Bill OS stock flow. Confirm deployed commit and environment without changing them. Create ADRs for unresolved stock ownership, guest access, refund provider semantics, courier provider, GST/charge tax policy and deployment.

**Acceptance:** source map cites real paths/methods; each finding confirmed/stale with evidence; no production/data mutation.

## Phase 1 — P0 security and financial/inventory integrity

### WP-01 Guest order authorization
Likely areas: `apps/api/src/orders`, `apps/api/src/returns`, auth/guards, storefront tracking.
- Replace phone + sequential order number authorization with authenticated ownership or high-entropy scoped guest capability.
- Hash capability at rest; expiry/revocation; rate limits; generic errors; audit access.
- Preserve support access through staff permission.
**Acceptance:** all order reads/mutations enforce ownership; no guessed reference exposes address/payment/pickup data; IDOR/enumeration tests pass; existing guest orders have safe claim/access path.

### WP-02 Return quantities and restock
Likely areas: `apps/api/src/returns/returns.service.ts`, Prisma return/order/inventory models.
- Model requested/approved/received/accepted quantities and disposition.
- Enforce cumulative returnable quantity.
- Make receive/restock atomic and idempotent with unique movement link and DB constraints.
- Implement exchange fully or disable it until replacement fulfilment exists.
- Reconcile historic records before backfill.
**Acceptance:** partial returns work; total never exceeds eligible fulfilled quantity; duplicate/concurrent receive cannot double-restock; damaged/non-restock disposition does not increase sellable stock; migration report identifies ambiguous legacy rows.

### WP-03 Refund unknown outcomes
Likely areas: `apps/api/src/payments/payments.service.ts`, payment/refund schema and reconciliation.
- Distinguish definitive failure from timeout/unknown.
- Reserve refundable capacity for submitted/unknown refunds.
- Use provider idempotency where available and reconcile before retry.
- Make webhook/reconciliation monotonic and duplicate-safe.
**Acceptance:** timeout never releases capacity; provider outcome resolves exactly once; concurrent/replayed operations cannot over-refund; lost response, delayed webhook and worker crash tests pass.

### WP-04 Bill OS outbound reservation sync
Likely areas: `apps/api/src/integrations/billos.service.ts`, validation contracts, inventory/order use cases, admin store ops.
- Confirm stock ownership and reservation handshake with Bill OS.
- Add transactional outbox/worker and versioned outbound contract.
- Handle acknowledgement, unknown timeout, retry, cancellation, dispatch, quarantine and reconciliation.
- Do not invent Bill OS endpoints/payloads; inspect its repo/API first.
**Acceptance:** reservation and outbox atomic; duplicate delivery/crash safe; POS/online race prevented or explicitly controlled; queue and failures visible; contract tests pass.

## Phase 2 — Commerce and provider correctness

### WP-05 Payment-session idempotency
Serialize concurrent session creation; enforce one active intent per order attempt; reconcile ambiguous provider order creation.
**Acceptance:** parallel calls do not create multiple chargeable sessions; replay returns stable state.

### WP-06 Courier/COD truth
Confirm provider/account; implement real serviceability/rate/COD support or verified coverage data; fail closed for unknown/stale data; separate COD policy; idempotent booking/reconciliation.
**Acceptance:** unsupported pincodes unavailable; COD not true by default; booking timeout cannot duplicate shipment.

### WP-07 Migration and seed safety
Add checked-in Prisma migrations; separate one-off migration job from API startup; production demo seed impossible; explicit reference-data bootstrap; validate production config.
**Acceptance:** fresh and upgrade DB tests pass; startup does not mutate schema/seed demo data; staging restore/migration test passes.

## Phase 3 — Identity and platform hardening

### WP-08 OTP and distributed abuse controls
Real production SMS provider; hashed OTP challenges; expiry/single-use/attempt cap/resend cooldown; shared rate limit; provider outage/spend alerts.
**Acceptance:** no production OTP silently omitted/logged; limits proven across instances.

### WP-09 Browser sessions
Prefer HttpOnly Secure SameSite cookie/BFF; CSRF/origin checks; refresh rotation/reuse detection; session revocation; CSP/security headers; separate customer/staff contexts.
**Acceptance:** token not readable by JS under chosen design; login/MFA/logout/refresh flows and CSRF/reuse tests pass.

### WP-10 Role matrix and admin privilege
Compare documented matrix with every controller/guard/action; default deny; branch/location scope; remove/tightly scope service-key bypass; step-up and reason-coded audit for sensitive actions.
**Acceptance:** authorization matrix tests cover roles/resources/actions; hidden UI controls cannot bypass API permissions.

## Phase 4 — Production operations

### WP-11 Observability
Structured logs with correlation IDs and redaction; error monitoring, metrics, traces, dashboards and actionable alerts for unknown refunds, webhooks, Bill OS lag, outbox age, courier, DB, OTP and backup.

### WP-12 Backup/DR
Owner-approved RPO/RTO; encrypted off-site backups and PITR if available; restore runbook; isolated restore drill; validate orders/payments/invoices/inventory.

### WP-13 Deployment hardening
Choose one production path; pin images, non-root containers, limits, health/readiness and secret injection; correct CI triggers; protected deploy approval; confirm canonical domains/TLS/CORS/cookies/webhooks.

**Phase acceptance:** staging deploy and rollback drill pass. Production remains gated on owner approval.

## Phase 5 — Product quality and scale

Replace placeholder product photography/content with approved assets; improve media pipeline; persist cart/wishlist only if cross-device recovery is required; improve accessibility/mobile UX; optimize based on measured performance; load test checkout; extract services only with measured need and ADR.

## Production release blockers

- P0 packages accepted and regressions pass.
- No unresolved critical/high security issue without approved mitigation.
- Migrations/backfills validated against production-like copy.
- Bill OS ownership/reservation contract signed off.
- Payment/refund unknown outcomes reconciled.
- Courier serviceability/COD verified.
- Real OTP provider configured.
- Production seed disabled and startup migration-safe.
- Backup restore proven; RPO/RTO approved.
- Monitoring, incident contacts and rollback verified.
- CI green on actual protected branch.
- GST and shipping/COD tax treatment reviewed by qualified accountant.
- Owner explicitly approves migration, release, deployment and version bump.

## Owner decisions required

1. Is Bill OS master for all physical stock, or does JAFSON own online reservations?
2. Must checkout wait for Bill OS reservation acknowledgement?
3. Which courier provider/account and pickup/return/COD rules?
4. Canonical storefront/admin domains?
5. Which SMS provider/sender/template setup?
6. Guest order UX: magic link, OTP or account login?
7. Accountant-approved GST treatment for shipping, COD, discounts, returns and credit notes?
8. Required RPO/RTO and support hours?
9. Which production hosting plan/provider is approved?
