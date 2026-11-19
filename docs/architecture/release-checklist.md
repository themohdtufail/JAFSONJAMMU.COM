# Release checklist

Spec section 13 (acceptance) and section 14 (release gates), with the evidence for each and what is still open. **Nothing here has been released.** Releasing, running migrations on production, and changing production data need the owner's explicit approval.

Status: **PASS** (automated test or script proves it), **PARTIAL** (built and tested, but not against the live service or real data), **OPEN** (needs a person, an account or data).

## Section 13: acceptance criteria
| # | Criterion | Status | Evidence / what is left |
|---|---|---|---|
| 1 | Customers can buy men's clothing | PASS | `tests/e2e/smoke.mjs`, API tests |
| 2 | Customers can buy kids' clothing | PASS | Same flows; kids products in seed data and API tests (kids SKUs in Bill OS, returns and cart tests) |
| 3 | Every variant has independent inventory | PASS | Per-variant balances; ledger tests |
| 4 | Online orders reserve stock correctly | PASS | `api.e2e`, `concurrency.e2e` |
| 5 | Showroom sales sync correctly | PARTIAL | Server side and reference adapter tested (`billos-adapter.e2e`); the real Bill OS app must embed the adapter |
| 6 | Offline Bill OS sales recover without double deduction | PARTIAL | Proven with the reference outbox including lost responses; needs the real Bill OS |
| 7 | No overselling under concurrent purchases | PASS | 40 buyers for 6 units, online vs showroom race, dispatch under load (`concurrency.e2e`) |
| 8 | UPI and other approved methods work | PARTIAL | Razorpay tested against a fake; run in Razorpay test mode (`payments.md` checklist) |
| 9 | COD works | PASS | Smoke and API tests |
| 10 | Local delivery works | PASS | Pincode rules and orders in API tests |
| 11 | Nationwide courier works | PARTIAL | Orders, shipments and tracking entry work; courier API booking is not built |
| 12 | Showroom pickup works | PASS | Pickup code, confirmation record enforced by the database |
| 13 | Returns and refunds work | PASS (card) / OPEN (COD) | Returns, restock once, partial refunds, credit notes; COD refunds are recorded manually |
| 14 | Admin permissions enforced | PASS | Role tests, MFA tests |
| 15 | Android and iOS journeys work | OPEN | Mobile apps are not built (separate project) |
| 16 | Customer and financial data protected | PASS (code) / OPEN (operations) | Hashing, MFA, throttling, headers, CSP, audit log; needs a security review of the live deployment |
| 17 | Backups can be restored | PARTIAL | Restore tested on every run (`backup.test.ts`); schedule backups and run a drill on real data |
| 18 | Monitoring and incident recovery operational | OPEN | Error reporting is built (set `SENTRY_DSN`); uptime alerts, on-call and runbook need people |
| 19 | Business policies and legal configuration approved | OPEN | GSTIN, address, CIN, HSN codes, GST rates, returns/privacy/terms text, legal metrology on tags |
| 20 | Production deployment explicitly approved | OPEN | Waiting for the owner |

## Section 14: release gates
| Gate | Status | Evidence / what is left |
|---|---|---|
| All critical automated tests pass | PASS | `pnpm -r test` (API, ledger, contract); browser: smoke, account sync, accessibility, CSP, GST journey |
| No unresolved critical or high security vulnerabilities | PASS | `pnpm audit` reports none (production and dev); audited defects D1 to D13 fixed (`roadmap.md`). Needs an independent penetration test before taking real money |
| Inventory reconciliation passes | PASS (tooling) | `pnpm --filter @jafson/api integrity` and Admin > integrity endpoint. Run against production data before launch |
| Payment reconciliation passes | PARTIAL | In-system checks pass; settlement reports from Razorpay still need to be compared |
| Bill OS integration acceptance passes | PARTIAL | Automated for the contract; real Bill OS pending |
| Backup restoration passes | PARTIAL | See criterion 17 |
| Production monitoring active | OPEN | See criterion 18 |
| Business owner signs off on staging | OPEN | There is no staging environment yet; create a second Render blueprint with test keys |
| Mobile store submissions reviewed | OPEN | Not applicable until mobile apps exist |

## Before the first real order (in order)
1. Fix the deployment: `DATABASE_URL` must be set on the API service (the first deploy failed on it).
2. Set `SEED_CATALOGUE=0` and enter the real catalogue and photos. The demo catalogue and stock photos must not go live.
3. `SELLER_GSTIN`, `SELLER_ADDRESS`, `SELLER_CIN`; an HSN code and confirmed GST rate on every product (see `gst.md`).
4. `SMS_PROVIDER=msg91` with DLT-registered templates, `EMAIL_PROVIDER=resend` with a verified domain; `SENTRY_DSN`. Without SMS, sign-in codes do not work (guest checkout does).
5. Razorpay: test-mode run of the `payments.md` checklist, then live keys and webhook.
6. Remove `ADMIN_BOOTSTRAP_*` after the owner signs in and enables two-step login. Leave `ADMIN_API_KEY` unset.
7. Set up scheduled encrypted backups and do a restore drill; run the integrity check on production data.
8. Add Cloudflare Access in front of the back-office; keep the `onrender.com` addresses private (see D5 in `roadmap.md`).
9. Owner approval to deploy.

## Infrastructure execution log (2026-11-18)
Auto-Deploy is **off** on all three Render services (set via the Render API). Pushing to the branch no longer builds anything; changing `render.yaml` can still trigger a Render Blueprint sync, so avoid editing it without intent. Nothing has been deployed, migrated or activated by this pass.

| Item | Status | Notes |
|---|---|---|
| Inspect Render services | COMPLETE | 3 free-plan docker services in Singapore, branch `claude/dazzling-hawking-ovjfwq`; shared group `jafson-shared` holds `INTERNAL_PROXY_SECRET` |
| Disable Auto-Deploy | COMPLETE | Verified by re-reading each service; a push afterwards created no deploy |
| Inspect Supabase / Session Pooler | BLOCKED | The token supplied is rejected by Supabase ("JWT could not be decoded"): it must be a personal access token (starts `sbp_`) from Account > Access Tokens |
| Prepare `DATABASE_URL` | BLOCKED | Depends on the Supabase step; the password is never visible to the assistant, so either the owner pastes the string into Render, or approves a password reset done by script |
| Verify `ADMIN_BOOTSTRAP_EMAIL` | BLOCKED | Not set on the API service |
| Review migrations before touching the database | COMPLETE | Six migrations, all additive; the only DROPs are `DROP TRIGGER IF EXISTS` before re-creating the same trigger; no NOT NULL column without a default |
| Apply schema | NEEDS OWNER APPROVAL | Runs automatically when the API starts with a valid `DATABASE_URL` |
| Bootstrap owner, verify login and MFA, remove bootstrap credentials | NOT STARTED | After the database exists |
| Demo catalogue cannot go public | COMPLETE (code) / NEEDS OWNER APPROVAL (setting) | Production seed now skips demo products unless `ALLOW_DEMO_CATALOGUE=1`; tests cover it, and that re-seeding never overwrites real data. `SEED_CATALOGUE=1` is still set on the API service and should be changed to `0` |
| Seller GST, address, CIN, product HSN and rates | BLOCKED | Needs the company's real values |
| MSG91, Resend | BLOCKED | Needs accounts, DLT templates, a verified domain, and the owner to enter the keys in Render |
| Razorpay test mode and the four payment scenarios | BLOCKED | Needs test keys entered in Render; scenarios are scripted in `payments.md` and pass against the fake |
| Order, inventory and notification verification | NOT STARTED | Needs the API running |
| Bill OS audit | COMPLETE | The real application adapter is **not implemented**; only the server side and a reference library exist |
| Security, reliability and deployment readiness | PARTIAL | Live headers verified on both sites; shop fails cleanly (502) while the API is down; API cannot start |
| End-to-end test order | NOT STARTED | Needs the API |
| Backup and restore drill | PARTIAL | Automated restore test passes; drill on real data needs the database |

### First database initialisation (2026-11-18, owner-approved, run from the Render dashboard)
- `DATABASE_URL` is the Supabase **Session pooler** (Tokyo region, port 5432). The password's `@` and `#` were percent-encoded; the password itself was not changed or weakened.
- The API start applied all six migrations to the empty database ("All migrations have been successfully applied", "database ready"), and the seed loaded **0 products** (`SEED_CATALOGUE=0`, plus the production guard).
- Verified after start: health 200; public product list empty through the API and through the shop's proxy; demo product page 404; local delivery and COD rules present for pincode 180004; 36 states and territories listed; admin routes 401 without sign-in; the mock payment webhook 404; admin login endpoint answers `INVALID_CREDENTIALS` for a wrong password.
- Still open: owner sign-in and two-step login (owner), then removal of `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`; seller GST details; MSG91, Resend, Razorpay test keys; the integrity check run against this database once an owner token exists; end-to-end test order.

### Owner account and bootstrap removal (2026-11-18/19, owner-approved)
- Owner signed in, set up two-step login, and changed the generated password with the new Password card (`POST /admin/me/password`; also added: owner reset of a colleague's password, shared password rules). The old generated password was confirmed rejected by the live API before it was deleted.
- `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` deleted from the API service; the API was restarted afterwards. The start log shows: 6 migrations found, "No pending migrations to apply", "database ready", "seeded 0 products", started. No bootstrap value appears in any log line.
- Live checks after the restart: health 200; 0 public products (directly and through the shop); mock payment webhook 404; admin routes 401 without sign-in; wrong login answers `INVALID_CREDENTIALS`.
- Free-plan note: the API sleeps when idle and the first request after a sleep took over 90 seconds. Customers would see that. A paid always-on plan (or an external uptime ping) is needed before launch.

### Domains switched (2026-11-19, owner-approved)
`jafson.chamerondigital.com` and `jafson-admin.chamerondigital.com` now point at the Render services (CNAME to `jafson-web.onrender.com` and `jafson-admin.onrender.com`), proxied by Cloudflare (SSL Full, Always HTTPS, TLS 1.2). Method: DNS-only first so Render could verify and issue certificates, then the proxy was turned on. The previous records (tunnel `b0a6d642-…`) were saved to the session scratchpad; to roll back, point both CNAMEs at `b0a6d642-655f-4944-bbf7-df9cefb908e6.cfargotunnel.com` (the tunnel has no connector, so that returns 530). Verified: HTTPS 200 with a valid certificate on both, HTTP redirects to HTTPS, security headers present, shop-to-API calls work, back-office rejects unsigned admin calls, all footer links resolve.
Demo catalogue switched on by owner request (`SEED_CATALOGUE=1`, `ALLOW_DEMO_CATALOGUE=1` on the API) for the next start only. Both must be reverted afterwards (`SEED_CATALOGUE=0`, remove `ALLOW_DEMO_CATALOGUE`), and the demo products replaced with the real catalogue before launch.
