# Claude Engineering Instructions — JAFSON JAMMU

Read `docs/architecture/README.md` and every document in `docs/architecture/` before changing code.

## Rules
- Inspect current branch, commit, source, Prisma schema/migrations, tests, CI, environment definitions and deployment files first. The audit is a snapshot, not a substitute for current inspection.
- Preserve the existing pnpm monorepo, NestJS API, Next.js storefront/admin, PostgreSQL/Prisma, shared validation and inventory packages. Prefer incremental fixes; do not rewrite for preference.
- Treat source as evidence of current behavior and architecture docs as target design. If they conflict, document the conflict and create an ADR before choosing.
- Do not silently change order, tax, payment, stock, return, customer or Bill OS semantics.
- Every DB change needs a versioned migration, backfill plan, recovery/rollback plan and tests. Never use `prisma db push` as a production migration mechanism.
- Money uses integer paise. Inventory changes require durable ledger movements, idempotency and concurrency protection.
- External side effects (payments, refunds, SMS, courier, Bill OS) must be idempotent or reconciled. A timeout is an unknown outcome, not proof of failure.
- Enforce object ownership and permissions on the server. UI hiding is not authorization.
- Never log/store plaintext OTPs or expose passwords, tokens, MFA seeds, payment secrets or unnecessary PII.
- Add regression tests; do not weaken tests to make code pass. Report actual test commands/results and anything not run.
- Do not modify production data, run live payment/refund operations, rotate production secrets, deploy, release, or bump versions without explicit owner approval.
- Work on a feature branch, use focused commits, open a PR for review, and do not merge without approval.

## Required workflow
1. Reinspect exact source paths and write a plan/risk list.
2. Add failing regression tests.
3. Implement the smallest safe change.
4. Run targeted tests, package checks and full CI-equivalent checks.
5. Review security, data integrity, backwards compatibility, accessibility and scope.
6. Update architecture docs, ADRs, migration notes and runbooks.
7. Report changed paths, migrations/backfills, commands/results, residual risks and deferred work.

## Priority order
Follow `docs/architecture/IMPLEMENTATION-ROADMAP.md`: guest-order authorization; return quantity/restock integrity; ambiguous refund outcomes; Bill OS outbound reservation sync; payment-session idempotency; courier/COD truth; migration and seed safety; real OTP and distributed rate limits; browser session hardening; then observability, backup/DR and deployment hardening.

## Definition of done
Acceptance criteria met, regression tests passing, relevant CI green or explicitly unavailable, documentation updated, and no unapproved production action. Compilation alone is not completion.
