# JAFSON JAMMU: engineering handoff

Read in this order: this file, `docs/architecture/spec.md` (the approved requirements baseline), `docs/architecture/roadmap.md` (phases, status, known defects), then the topic notes in `docs/architecture/`.

## Rules of engagement
- Extend the existing code; do not rewrite it. Preserve existing functionality and business data.
- Each phase: inspect, plan, write regression tests (they must fail on the old code where a bug is being fixed), implement, run tests and builds, update docs.
- Never mark work complete that is not. Record limits and risks in `roadmap.md`.
- **Do not deploy, release, run production migrations, change production data, or bump versions without explicit approval from the owner.** Pushing to the development branch is fine.
- Money is integer paise, prices are tax-inclusive, stock changes only through guarded SQL and append-only movements.
- Secrets never go in the repo or in chat. Production secrets live in the host's environment settings.

## Layout
`apps/api` NestJS + Prisma + Postgres. `apps/web` storefront. `apps/admin` back-office. `packages/validation` Bill OS event contract. `packages/inventory-core` reference ledger semantics. `packages/design-tokens` brand kit. `deploy/` and `render.yaml` hosting files.

## Commands
    pnpm install
    pnpm db:setup && pnpm db:seed          # needs Postgres and apps/api/.env
    pnpm -r typecheck
    pnpm -r test                           # API tests run against a real jafson_test database
    pnpm e2e                               # browser smoke; needs API, web and admin running
    node tests/e2e/gst.mjs                 # GST journey; needs the API in tax mode

## Conventions
- Errors are `AppError(code, message, status)`; the web apps map codes to friendly text in `lib/api.ts`.
- Roles: STAFF < MANAGER < OWNER via `@MinRole`. Staff identity in audit rows must be traceable to an account.
- Env is read lazily through `cfg()` so tests can change it.
