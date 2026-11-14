# Claude Engineering Instructions — JAFSON JAMMU

This repository is the JAFSON JAMMU commerce platform. Before changing code, read the architecture handoff in `docs/architecture/`. Those documents are the project-level engineering contract for the next implementation phase.

## Required reading order

1. `docs/architecture/README.md` — document map, current-state facts, and how to use this handoff.
2. `docs/architecture/ARCHITECTURE.md` — target system boundaries and runtime architecture.
3. `docs/architecture/DOMAIN-AND-DATA.md` — domain invariants, data ownership, transaction rules, and state machines.
4. `docs/architecture/SECURITY-RELIABILITY.md` — threat model, authorization, resilience, observability, and recovery requirements.
5. `docs/architecture/INTEGRATIONS-AND-DEPLOYMENT.md` — Bill OS, payments, courier, deployment, and operational contracts.
6. `docs/architecture/TEST-STRATEGY.md` — required test layers and release gates.
7. `docs/architecture/IMPLEMENTATION-ROADMAP.md` — ordered work packages, acceptance criteria, and dependency sequence.

## Non-negotiable working rules

- Start by inspecting the current branch, current commit, package scripts, relevant source files, Prisma schema, migrations, tests, environment variable definitions, CI and deployment manifests. The audit is a snapshot, not permission to assume the code has not changed.
- Treat existing code as the source of truth for current behavior. Treat the architecture documents as the target design. If they conflict, identify the exact conflict and propose an ADR before choosing a direction.
- Do not rewrite the application or replace the monorepo, framework, database, or design system merely for preference. Prefer incremental, backwards-compatible changes.
- Do not silently change customer-facing behavior, financial calculations, tax behavior, stock semantics, order lifecycle, API contracts, or Bill OS event contracts.
- Preserve the current repository's naming and module conventions unless a documented ADR approves a change.
- Every database change must include a forward migration, rollback/recovery strategy, data backfill plan where applicable, and tests. Do not use `prisma db push` as a production migration mechanism.
- Every money amount must remain integer paise (or the repository's established integer minor-unit representation). Never use floating-point arithmetic for money.
- Every inventory mutation must be traceable to a durable movement/ledger record and protected against duplicate processing and concurrent oversell.
- External side effects (payment, SMS, courier, Bill OS) must be idempotent or explicitly reconciled. Do not assume a timeout means the remote operation failed.
- Enforce authorization on the server for every object and action. Hiding a button or route is not authorization.
- Do not log OTPs, passwords, access tokens, refresh tokens, payment secrets, TOTP secrets, full payment instruments, or unnecessary personal data.
- Do not put secrets in source control, fixtures, screenshots, test output, or documentation.
- Do not weaken or delete tests to make a change pass. Add regression tests for every fixed defect.
- Do not mark work complete based only on typecheck or compilation. Run the relevant tests, full CI-equivalent checks where feasible, and document anything not run.
- Do not fabricate test results, production state, provider capabilities, serviceability, delivery promises, or operational readiness.
- Do not run destructive production commands, alter live data, rotate production secrets, create live payment/refund operations, or perform a production deployment without explicit approval.
- No release, deployment, production migration, or version bump is authorized by this handoff. Stop before those actions and request approval.
- Use feature branches and focused commits. Open a pull request for review; do not merge it unless explicitly instructed.
- Keep documentation synchronized with implementation. Update the relevant architecture/ADR and runbook whenever behavior or an operational contract changes.

## Required implementation workflow

For each work package:

1. Re-read the current source and identify the exact affected paths.
2. Write a short implementation plan and list risks before editing.
3. Add failing regression tests that reproduce the defect or enforce the new invariant.
4. Implement the smallest safe change.
5. Run targeted tests, then affected package checks, then the full CI-equivalent suite.
6. Review the diff for security, data integrity, backwards compatibility, accessibility, performance, and accidental scope expansion.
7. Update docs, migration notes, and operational runbooks.
8. Report changed files, migration/backfill requirements, test commands and actual results, residual risks, and work intentionally not done.

## Priority order

Follow `IMPLEMENTATION-ROADMAP.md`. In summary: (1) guest-order authorization, (2) return quantity/duplicate/concurrency correctness, (3) ambiguous refund outcomes, (4) Bill OS outbound synchronization and inventory reservation coordination, (5) payment-session idempotency, (6) real courier serviceability and COD policy, (7) production-safe migrations and seed behavior, (8) OTP delivery and distributed rate limiting, (9) browser session hardening, then deployment/observability/DR improvements.

## Definition of done

A task is done only when its acceptance criteria are met, regression tests exist and pass, the relevant CI checks pass or are explicitly recorded as unavailable, documentation is updated, and no unapproved production action has occurred. A code change that compiles but violates a domain invariant is not done.
