# Deploying Jafson Jammu

Target: **https://jafson.chamerondigital.com** (shop) and **https://jafson-admin.chamerondigital.com** (back-office), DNS and TLS by Cloudflare.
(`jafson.admin.chamerondigital.com` would be a second-level name that Cloudflare's free certificate does not cover, so the back-office uses `jafson-admin`.)

```
Browser -> Cloudflare (DNS, TLS, WAF) -> Tunnel -> cloudflared -> web :3000 / admin :3001 -> api :4000 -> Postgres
```
Nothing is exposed on the server; there are no inbound ports to open. The shop and back-office call the API through their own `/api` path, and the Razorpay webhook uses `https://jafson.chamerondigital.com/api/v1/webhooks/payments/razorpay`.

## One-time server setup
1. A Linux VPS (2 vCPU, 4 GB RAM; Mumbai region for Indian customers) with Docker and the compose plugin.
2. `git clone` the repository, check out the release branch, then `cp deploy/.env.example deploy/.env` and fill every value (see comments).
3. In Cloudflare, Zero Trust > Networks > Tunnels > **jafson** > copy the token into `TUNNEL_TOKEN`.
4. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`
5. Open https://jafson.chamerondigital.com, sign in at https://jafson-admin.chamerondigital.com with the bootstrap owner, enable two-step login, then delete `ADMIN_BOOTSTRAP_*` from `.env` and restart the `api`.

## Cloudflare settings (done for you when an API token is supplied)
Tunnel `jafson` with two public hostnames, proxied DNS CNAMEs to it, SSL mode Full, Always Use HTTPS. Recommended by hand: Cloudflare Access (email OTP) in front of `jafson-admin`, and a rate-limit rule on `/api/v1/auth/*`.

## Updating
`git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` (the `migrate` step applies any new migrations).

## Backups and restore
Encrypted dump (AES-256) with a checksum; copy it off the server and keep the passphrase somewhere else:

    DATABASE_URL=... BACKUP_PASSPHRASE=... bash deploy/backup.sh /backups

Restore only ever goes into an **empty** database (the script refuses anything else). Restore to a new database, check it, then switch the API over:

    TARGET_DATABASE_URL=... BACKUP_PASSPHRASE=... bash deploy/restore.sh /backups/jafson-YYYYmmdd-HHMMSS.sql.gz.enc

`apps/api/test/backup.test.ts` restores a real backup into a fresh database on every test run. Run a restore drill against a copy of production data before launch and at least quarterly. On Supabase, also enable its own daily backups (paid plans) and treat these dumps as the second copy.

## Database changes
The API applies `apps/api/prisma/migrations` on start (`prisma migrate deploy`): applied migrations are skipped, nothing is dropped. To change the schema: edit `schema.prisma`, run `pnpm --filter @jafson/api db:migration <name>`, review the generated SQL, commit it. A test fails if the schema and the migrations disagree. A database created earlier with `db push` is baselined automatically, keeping its data. Never run `db push` against production.

## Before taking real orders
Razorpay live keys and webhook, GSTIN/address/HSN codes, real catalogue and photos, an SMS provider for login codes (OTP is not echoed in production, so shopper sign-in does not work until one is added), legal pages reviewed. Guest checkout with order number and phone works without SMS.
