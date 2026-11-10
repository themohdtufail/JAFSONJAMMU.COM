# Payments (Razorpay)

UPI and cards go through Razorpay Checkout (hosted, so card details never touch our servers). Cash on delivery is unchanged.

## How a payment flows
1. Customer places an order. Stock is reserved for 15 minutes.
2. `POST /v1/payments/session` creates a Razorpay order **on the server for the exact order total** and returns only the public key id and order id.
3. The browser opens Razorpay Checkout. On success Razorpay returns `order_id | payment_id | signature`.
4. `POST /v1/payments/verify` checks the signature (HMAC-SHA256 with the key secret). Only then is the order confirmed.
5. Razorpay's webhook is the safety net if the browser never returns (closed tab, bad network). It is signed, idempotent on `x-razorpay-event-id`, and amount-checked.
6. Money that arrives after the order expired or was cancelled marks the order `REFUND_DUE`; staff refund it from the back-office.

Refunds: back-office order page, "Refund online" (manager or owner). Full refunds only, on cancelled or delivered orders, one live refund per payment (row lock), provider errors leave the order unchanged and can be retried. `refund.processed` / `refund.failed` webhooks keep status in sync.

## Go-live checklist
1. Create a Razorpay account and complete KYC. Start in **Test mode** (keys start `rzp_test_`).
2. Dashboard > Settings > API Keys: generate keys. Set on the API server:
   `PAYMENTS_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (never commit or expose the secret).
3. Dashboard > Settings > Payment Capture: set to **automatic**. The API treats `payment.captured` as paid and does not capture manually.
4. Dashboard > Webhooks: add `https://<your-api-domain>/v1/webhooks/payments/razorpay`, choose a secret, set `RAZORPAY_WEBHOOK_SECRET` to the same value, and enable:
   `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
5. Serve the storefront over HTTPS. If you add a Content-Security-Policy, allow `checkout.razorpay.com` (script, frame) and `api.razorpay.com`.
6. Test in Test mode: a successful UPI/card payment, a failed one, closing the popup then paying again from the order page, a refund, and a webhook delivery (Dashboard shows delivery status and can resend).
7. Swap in live keys and a live webhook only after the above passes. Keep `PAYMENTS_PROVIDER=mock` out of production.
8. Production needs real database migrations (`prisma migrate`), not `db push`. The new `Payment.providerPaymentId`, `Payment.method` and `Refund` table are in this change.

## Not covered yet
- **Not run against live Razorpay.** Tests use a faithful fake of its order and refund API plus signed webhooks; run the checklist in Test mode before relying on it.
- Partial refunds, refunds on COD orders (manual), disputes/chargebacks, settlement reconciliation (spec JAF-205), GST credit notes and invoices.
- `payment.authorized` (manual capture) is ignored on purpose; keep automatic capture on.
