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
