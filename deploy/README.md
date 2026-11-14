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
`git pull && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` (the `migrate` step re-applies the schema). Database changes that drop data need a real migration plan first: this stack uses `prisma db push`.

## Backups
`docker compose -f deploy/docker-compose.yml exec db pg_dump -U jafson jafson | gzip > jafson-$(date +%F).sql.gz` daily to storage off the server, and test a restore.

## Before taking real orders
Razorpay live keys and webhook, GSTIN/address/HSN codes, real catalogue and photos, an SMS provider for login codes (OTP is not echoed in production, so shopper sign-in does not work until one is added), legal pages reviewed. Guest checkout with order number and phone works without SMS.
