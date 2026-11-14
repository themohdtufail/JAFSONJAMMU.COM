#!/usr/bin/env bash
# One-command install on a fresh Ubuntu/Debian server (run as root, from inside the cloned repository):
#   bash deploy/install.sh
# Installs Docker, generates every secret, asks only for the Cloudflare tunnel token, and starts the site.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { apt-get update -y && apt-get install -y curl ca-certificates && curl -fsSL https://get.docker.com | sh; }
ENV=deploy/.env
if [ ! -f "$ENV" ]; then
  read -rp "Cloudflare tunnel token (the long text after 'cloudflared ... --token'): " TOKEN
  read -rp "Owner email for the back-office: " EMAIL
  PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
  r() { openssl rand -hex "$1"; }
  cat > "$ENV" <<EOF
POSTGRES_PASSWORD=$(r 24)
TUNNEL_TOKEN=$TOKEN
JWT_SECRET=$(r 48)
MFA_ENCRYPTION_KEY=$(r 32)
ADMIN_API_KEY=
BILL_OS_API_KEY=$(r 32)
PAYMENT_WEBHOOK_SECRET=$(r 32)
REQUIRE_ADMIN_MFA=1
CORS_ORIGINS=
ADMIN_BOOTSTRAP_EMAIL=$EMAIL
ADMIN_BOOTSTRAP_PASSWORD=$PASS
SEED_CATALOGUE=1
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SELLER_LEGAL_NAME=Chameron Industries Private Limited
SELLER_GSTIN=
SELLER_CIN=
SELLER_ADDRESS=
EOF
  chmod 600 "$ENV"
  echo; echo "Back-office sign-in: $EMAIL / $PASS   (save this now; change it after first login)"; echo
fi
docker compose -f deploy/docker-compose.yml --env-file "$ENV" up -d --build
echo "Started. Shop: https://jafson.chamerondigital.com   Back-office: https://jafson-admin.chamerondigital.com"
echo "Payments stay off until Razorpay keys are added to $ENV (then re-run this script)."
