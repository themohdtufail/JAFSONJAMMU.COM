# JAFSON JAMMU — Architecture & Engineering Handoff

**Purpose:** authoritative technical blueprint for the next engineering phase.  
**Audit snapshot:** `58eb6813a2297ca556c5bf587a003d329a11b94f` on `claude/dazzling-hawking-ovjfwq`.

> This is a target architecture and remediation plan, not proof that recommendations are implemented. The audit was read-only and did not run tests or access production systems. Reinspect the repository before implementation.

## Executive decision

Preserve the current pnpm monorepo: NestJS API, Next.js storefront, Next.js admin, PostgreSQL/Prisma, shared validation, inventory core and design tokens. Do not rewrite. Strengthen domain invariants, transaction boundaries, integration reliability, security, tests and operations incrementally.

Target operating model:
- JAFSON API and PostgreSQL own online orders, payments/refund records, customers, returns, tax documents, staff operations and online reservations.
- Inventory movements are immutable and auditable; current stock is a transactionally maintained projection.
- Bill OS is the POS/physical-store authority where business policy says so. Online reservations, cancellations and fulfilment must be synchronized through durable, idempotent messages. An inbound webhook is not a two-way integration.
- Payment, courier, OTP/SMS and Bill OS are external systems behind adapters.
- Browser state is never authoritative for price, tax, inventory, payment or authorization.

## Audit baseline (snapshot only)

| Area | Observed |
|---|---|
| Workspace | pnpm monorepo: `apps/api`, `apps/web`, `apps/admin`, shared packages |
| Backend | NestJS |
| Frontends | Next.js storefront and admin |
| Database | PostgreSQL/Prisma; 27 Prisma models observed |
| Tests | 103 Vitest `it()` definitions across 9 files |
| CI | One GitHub Actions workflow; PR and pushes to `main` |
| Deployment | Render blueprint and Docker Compose/Cloudflare Tunnel |
| Integrations | Razorpay, OTP/SMS abstraction, courier logic, Bill OS inbound events |

Test definitions are not passing test evidence. The audit did not execute tests. Recheck counts and paths against the current tree.

## Highest-priority risks

1. Guest order lookup/mutation using sequential order number plus phone is not sufficient authorization.
2. Return receipt can restock the full original quantity; return items need explicit quantities, cumulative limits and atomic duplicate protection.
3. A payment/refund provider timeout is ambiguous; do not mark it failed or release refundable capacity without reconciliation.
4. Bill OS inbound events exist, but outbound reservation coordination is needed to prevent POS selling web-reserved stock.
5. Courier serviceability and COD must not default to true when coverage is unknown.
6. Production must never seed demo catalogue data or run schema mutation on every API startup.
7. Concurrent payment-session creation must be idempotent/serialized.
8. Production needs versioned migrations, real OTP delivery, distributed abuse controls, safer browser sessions, monitoring and tested backups.

## Documents

- [Architecture](./ARCHITECTURE.md)
- [Domain & Data](./DOMAIN-AND-DATA.md)
- [Security & Reliability](./SECURITY-RELIABILITY.md)
- [Integrations & Deployment](./INTEGRATIONS-AND-DEPLOYMENT.md)
- [Test Strategy](./TEST-STRATEGY.md)
- [Implementation Roadmap](./IMPLEMENTATION-ROADMAP.md)
- Root [CLAUDE.md](../../CLAUDE.md) defines coding-agent rules.

## How to execute

1. Confirm current branch, commit, actual deployment and source drift.
2. Trace checkout, payment, stock, returns, Bill OS and deployment flows in source.
3. Confirm each audit finding; mark stale findings with evidence.
4. Implement roadmap packages in order with focused PRs.
5. Write ADRs under `docs/architecture/adr/` for unresolved business/provider decisions.
6. Use expand/migrate/contract for schema changes and preserve existing financial records.
7. Keep production actions gated on explicit owner approval.

## Vocabulary

**Observed** = present in audit snapshot. **Required** = correctness/safety requirement. **Proposed** = approach to validate against source/provider contracts. **Open decision** = requires owner, accountant or provider confirmation.
