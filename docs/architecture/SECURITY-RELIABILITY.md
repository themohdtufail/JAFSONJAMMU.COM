# Security, Reliability & Operational Controls

## Security objectives

Protect customer PII, staff accounts, orders, inventory, payments/refunds, tax documents, integration credentials and availability. Treat browsers, query parameters, webhooks and external networks as untrusted.

## Threat model and controls

| Threat | Required control |
|---|---|
| Guessable order number plus phone used for access | Authenticated ownership or high-entropy scoped guest capability; rate limit and audit |
| IDOR across orders/returns/addresses | Server-side ownership and location scope on every object |
| Forged/replayed payment webhook | Raw-body signature, unique inbox event, amount/currency/order binding |
| Duplicate or ambiguous refund | Idempotency, UNKNOWN state, reconciliation, refundable-capacity reservation |
| Double return/restock | Quantity ledger, transactional lock, unique movement |
| POS sale races online reservation | Shared reservation contract, stock guard, reconciliation |
| Staff takeover | MFA, strong password hashing, secure sessions, limits and audit |
| XSS token theft | HttpOnly cookie/BFF, CSP, output encoding, dependency hygiene |
| OTP brute force/replay | Short expiry, single use, attempt cap, distributed limits |
| Secret leakage | Secret manager/env injection, redaction, rotation runbook |
| Privilege escalation | Default-deny server permissions, step-up auth, no production bypass |
| Data loss | Encrypted backups, PITR where available, restore drills |

## Guest order authorization

Order number is a reference, not a credential. Phone number is not secret. For authenticated users, derive customer ID from verified session and enforce ownership on every route. For guests, issue a cryptographically random capability (128 bits minimum; 256 preferred), store only its hash, scope it to one order and permitted actions, expire/revoke it, and never log or expose it to analytics/referrers. Prefer one-time exchange into a short-lived secure session. Rate-limit by IP, order reference and normalized phone/account; use generic errors to reduce enumeration. Audit sensitive reads and mutations.

## Staff authorization

Maintain a server-side role/permission matrix and reconcile it against every controller guard. Default deny. Scope by branch/location where applicable. Require MFA for privileged staff and step-up/re-authentication for refunds, manual stock adjustments, staff/role changes, security configuration and recovery. If an emergency service-key bypass remains, disable by default, scope to minimum capability, restrict network where possible and audit every use. Revoke sessions on password reset, staff disablement, role change and compromise. Audit actor, action, target, reason, request ID, timestamp and safe before/after diff.

## Sessions and browser security

Audit observed tokens in localStorage/sessionStorage. Prefer HttpOnly, Secure, SameSite cookies with documented CSRF protection or a server-side BFF session. Rotate session identifiers after login, MFA and privilege elevation. Use short-lived access context, refresh rotation and reuse detection. Apply restrictive CSP, HSTS after HTTPS is stable, frame-ancestors, Referrer-Policy, X-Content-Type-Options and Permissions-Policy. Avoid unsafe HTML. Keep server credentials out of public Next.js environment variables. Restrict CORS per environment. Cookie-authenticated state changes require CSRF tokens/origin checks.

## OTP and abuse controls

Use a real production SMS provider; never silently log OTP as fallback. Store keyed hash, bind challenge to account/phone and purpose, short expiry, single use, attempt cap and resend cooldown. Rate-limit by IP, account/phone, device where lawful, and provider spend. Do not reveal account existence. Use shared atomic rate limits across replicas (Redis or DB-backed) for OTP, login/MFA, guest lookup, checkout/payment, refunds/returns, webhooks and privileged admin actions. In-memory limits are not sufficient across replicas.

## Webhook/integration security

Verify signatures over raw bytes before parsing/mutating. Separate secrets per provider/environment. Enforce timestamp/replay windows where supported. Persist event IDs uniquely. Validate sender, schema, merchant, currency, amount, SKU/location mapping and allowed state transition. Retain raw payload only when needed, encrypted/redacted with retention. Acknowledge only after durable inbox persistence. Quarantine poison messages and require audited replay.

## Data and secrets

Classify data as public/internal/confidential/restricted. TLS in transit; managed encryption at rest for DB/storage/backups. Encrypt MFA seeds and integration secrets with keys held outside DB and documented rotation. Separate migration/runtime DB roles where practical. Never commit env files, credentials, private keys, production exports or unredacted support dumps. Redact cookies, auth headers, OTPs, tokens, secrets and payment data. Define retention for logs, events, backups and customer records. Run dependency and secret scanning.

## Reliability patterns

**Transactional outbox:** write business state and message in the same DB transaction. Worker claims with lease, sends idempotently, records attempts/results, retries transient errors with exponential backoff/jitter, and quarantines poison messages.

**Inbox dedupe:** unique source/event ID before applying effects. Duplicate delivery is harmless. Inbox state and domain mutation are transactional or recoverably stateful.

**Timeouts/circuit breakers:** explicit connect/read/overall timeouts, bounded concurrency, safe retries only. Circuit breakers do not discard durable work.

**Reconciliation:** compare local payments/refunds with provider, shipments with courier, stock/reservations with Bill OS, invoice totals with orders, and queue age/backlog. Discrepancies create visible tasks and alerts; do not silently auto-correct financial/stock records.

## Observability

Structured logs: timestamp, level, service, environment, request ID, trace/correlation ID, actor type, order/payment/integration IDs, event, duration and sanitized error. Metrics: request errors/latency, DB pool, queue/outbox lag, webhook failures, OTP delivery, unknown refunds, stock conflicts, courier failures and job retries. Add traces, error monitoring with PII scrubbing, dashboards and actionable alerts. Never use phone/email/address/token as metric labels.

## Backup and disaster recovery

Agree RPO/RTO with owner. Configure encrypted automated backups, off-site copy independent of primary account/region, PITR if supported, retention and access controls. Run isolated monthly restore drills and verify orders, payments, invoices, constraints and inventory balances. Record measured restore time. A backup is not proven until restored.

## Proposed service objectives

Targets to validate, not measured guarantees: 99.5% monthly availability during agreed service hours; checkout API p95 under 800 ms excluding provider waits; no acknowledged order/payment event/inventory movement lost; unknown refund visible and reconciled within an agreed window; high-severity alert acknowledged within 15 minutes during staffed hours. Define support hours and escalation.
