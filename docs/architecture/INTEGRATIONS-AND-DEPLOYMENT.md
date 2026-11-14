# Integrations, Environments & Deployment

## Integration boundary

Each provider sits behind an internal adapter/port. Domain services must not depend directly on vendor SDKs. Normalize responses but retain provider references. Document owner, credentials, environment, webhook/signature, idempotency, timeout, retry, rate limits, data shared, retention, sandbox, failure behavior, monitoring and rotation for every integration.

## Bill OS

**Observed snapshot:** inbound event processing includes authentication, validation, deduplication, stock sale/receipt/return adjustments, quarantine/retry, snapshot reconciliation and admin visibility. Tests cover credentials, replay, quarantine, receipts/returns and discrepancy. This is a strong base, but does not prove a complete outbound integration.

**Target inbound:** authenticate sender; validate schema/version/event/SKU/location/quantity; insert durable inbox with unique source/event ID; process ledger mutation transactionally; quarantine invalid/unmapped events; reconcile snapshots without silently overwriting history.

**Target outbound:** order/reservation transaction writes outbox; worker sends stable idempotent event; Bill OS acknowledges accepted/rejected with correlation ID and stock version; JAFSON records acknowledgement; retries reuse key; timeout is UNKNOWN until queried/reconciled. Cancellation, dispatch and return follow same durable pattern.

Before implementation inspect Bill OS repository/API and agree SKU/location mapping, stock ownership, reservation semantics, event versions, authentication, checkout acknowledgement policy, expiry/cancellation order, offline POS behavior, retries and reconciliation. Do not invent endpoints or payloads. Store signed-off contract as versioned shared schema and add provider/consumer contract tests.

Admin ops should show queue depth, oldest age, failures/quarantine, last success, per-event status, replay, discrepancy and safe payload summary. Replay is privileged, reason-coded, idempotent and audited.

## Payment provider (Razorpay in snapshot)

Separate local payment intent from provider checkout session. Use provider idempotency if supported; otherwise DB uniqueness/lock plus reconciliation. Bind provider order ID to one local intent. Verify raw-body webhook signature, amount and currency. Persist event ID before mutation. Browser redirect is not payment proof. Refund timeout becomes UNKNOWN; reconcile before retry. Separate test/live credentials. Confirm current API version, idempotency behavior, refund lookup, webhook retry and settlement fields from current provider docs before coding. Never create live charges/refunds in tests.

## Courier

Audit found serviceability can be permissive for valid pincodes and COD may default true when coverage is missing. Confirm provider/account, pickup address, return flow and COD settlement first. Adapter should support pincode serviceability, rate, COD capability, booking, label, tracking, cancellation, NDR and RTO where provider offers them. Cache serviceability with source/fetched time/TTL; unknown or stale data fails closed. COD policy is separate from courier coverage. Shipment booking is idempotent and reconciled after ambiguous timeout. Never promise delivery from pincode syntax alone.

## OTP and notifications

Configure real production SMS provider and approved sender/templates under applicable Indian telecom/provider rules. API owns OTP generation/verification; provider only delivers. Hash challenge, expire, single-use, cap attempts and resends, never log OTP. Track provider delivery reference. Separate transactional messages from marketing consent/opt-out.

## Environments

- Local: developer DB, fake/sandbox providers, demo data only with explicit opt-in.
- CI: isolated ephemeral DB, deterministic fixtures, fake adapters.
- Staging: production-like topology and separate credentials/data.
- Production: managed DB, secret manager, real providers, no demo seed, restricted admin bootstrap, backups and monitoring.

Validate environment at startup. Fail fast if required production provider/secrets are missing; never silently fall back to insecure defaults.

## Migrations and startup

Audit observed Prisma schema setup/db push and API startup setup/seed behavior. Target: checked-in ordered Prisma migrations; one-off controlled migration job with dedicated role; API startup does readiness checks only; production reference-data bootstrap is explicit; demo catalogue seeding is prohibited in production. Use expand/migrate/contract and verify backup/recovery before migration. This document does not authorize production migration.

## Deployment topology

Recommended: storefront/admin behind TLS and edge protection; NestJS API behind controlled ingress; managed PostgreSQL/private networking/pooling; separate worker; object storage/CDN; secrets; centralized logs/metrics/traces; encrypted backups.

Snapshot Render blueprint uses free services and Supabase free DB in Singapore; free services may sleep and are not a production availability design. Docker Compose/Cloudflare Tunnel is viable self-managed topology only after image pinning, non-root containers, resource limits, health checks, secrets, backups and rollback are tested. Choose one production path and document it.

Snapshot domains: `jafson.chamerondigital.com` and `jafson-admin.chamerondigital.com`. Confirm canonical `jafsonjammu.com` hostnames before DNS/TLS changes. No domain changes are authorized here.

## Container hardening

Pin base/third-party images; avoid floating latest. Run non-root, read-only filesystem where possible, drop capabilities, set resource limits, graceful shutdown and health checks. Never bake secrets into build args/image layers. Separate public build config from runtime secrets. Scan images and dependencies.

## CI/CD

Audit workflow triggers PRs and pushes to `main`, while default branch snapshot is `claude/dazzling-hawking-ovjfwq`; verify and fix trigger coverage. Required CI: frozen pnpm install, lint/format, typecheck, dependency/secret scan, unit tests, PostgreSQL integration/migration tests, API tests, web/admin builds, Playwright critical paths, provider contract tests, image build/scan. Deploy only approved branch/tag after required checks. Separate build and deploy. Production environment requires manual approval; migrations are visible and separately approved. Include rollback instructions and known-good image.

Confirm canonical domains, redirects, cookie domain, CORS, OAuth callbacks, webhook URLs, TLS and admin access policy. Do not use localhost URLs in production navigation.
