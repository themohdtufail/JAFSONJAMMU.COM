export const cfg = () => ({
  jwtSecret: process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET required"); })() : "dev-secret-dev-secret-dev-secret"),
  adminKey: process.env.ADMIN_API_KEY ?? "",
  billOsKey: process.env.BILL_OS_API_KEY ?? "",
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
  /** "razorpay" (real) or "mock" (development only). Mock is never the default unless PAYMENTS_MOCK=1. */
  paymentsProvider: (process.env.PAYMENTS_PROVIDER ?? (process.env.PAYMENTS_MOCK === "1" ? "mock" : "razorpay")) as "razorpay" | "mock",
  paymentsMock: (process.env.PAYMENTS_PROVIDER ?? (process.env.PAYMENTS_MOCK === "1" ? "mock" : "razorpay")) === "mock",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "", razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "", razorpayBase: process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com",
  otpDevEcho: process.env.OTP_DEV_ECHO === "1",
  /** Two-step login for managers and owners. On by default in production. */
  requireAdminMfa: (process.env.REQUIRE_ADMIN_MFA ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1",
  mfaKey: process.env.MFA_ENCRYPTION_KEY ?? "",
  rateLimit: (process.env.RATE_LIMIT ?? (process.env.NODE_ENV === "test" ? "0" : "1")) === "1",
  rateLimitAuth: Number(process.env.RATE_LIMIT_AUTH ?? 20), rateLimitOrders: Number(process.env.RATE_LIMIT_ORDERS ?? 40), rateLimitDefault: Number(process.env.RATE_LIMIT_DEFAULT ?? 600),
  corsOrigins: (process.env.CORS_ORIGINS ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000,http://localhost:3001")).split(",").map((s) => s.trim()).filter(Boolean),
  /** Number of proxies in front of the API whose X-Forwarded-For entry is trusted (0 = none). "1" means one proxy. */
  trustProxyHops: Math.max(0, Math.min(5, Number(process.env.TRUST_PROXY ?? 0) || 0)),
  internalProxySecret: process.env.INTERNAL_PROXY_SECRET ?? "",
  lookupFailLimitPhone: Number(process.env.LOOKUP_FAIL_LIMIT_PHONE ?? 10), lookupFailLimitIp: Number(process.env.LOOKUP_FAIL_LIMIT_IP ?? 40), lookupWindowSec: 900,
  isProd: process.env.NODE_ENV === "production",
  /** Seller details printed on invoices. The GSTIN stays empty until the company is registered and it is confirmed: nothing is invented. */
  seller: { legalName: process.env.SELLER_LEGAL_NAME ?? "Chameron Industries Private Limited", gstin: process.env.SELLER_GSTIN ?? "", cin: process.env.SELLER_CIN ?? "", address: process.env.SELLER_ADDRESS ?? "" },
  /** GST state code of the seller (J&K = 01). Taken from the GSTIN when one is set. */
  sellerStateCode: (process.env.SELLER_GSTIN ?? "").slice(0, 2) || process.env.SELLER_STATE_CODE || "01",
  /** If the POS has been silent this long, online availability is reduced by this many units per variant until it reports again (0 disables). */
  posStaleAfterMinutes: Number(process.env.POS_STALE_AFTER_MINUTES ?? 30), posStaleExtraBuffer: Number(process.env.POS_STALE_EXTRA_BUFFER ?? 1),
  /** SMS and email delivery. "log" only writes to the log and is refused for sign-in codes in production. */
  smsProvider: (process.env.SMS_PROVIDER ?? "log") as "log" | "msg91", emailProvider: (process.env.EMAIL_PROVIDER ?? "log") as "log" | "resend",
  msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "", msg91OtpTemplate: process.env.MSG91_OTP_TEMPLATE_ID ?? "", msg91Base: process.env.MSG91_API_BASE ?? "https://control.msg91.com",
  msg91Templates: (() => { try { return JSON.parse(process.env.MSG91_TEMPLATES ?? "{}") as Record<string, string>; } catch { return {} as Record<string, string>; } })(),
  resendApiKey: process.env.RESEND_API_KEY ?? "", resendBase: process.env.RESEND_API_BASE ?? "https://api.resend.com", emailFrom: process.env.EMAIL_FROM ?? "Jafson Jammu <orders@jafson.example>",
  publicWebUrl: (process.env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sentryDsn: process.env.SENTRY_DSN ?? "",
  locationCode: "JAFSON_JAMMU_SHOWROOM",
  freeShippingPaise: 199900, courierFeePaise: 9900, localFeePaise: 4900, localFreeAbovePaise: 99900,
  codFeePaise: 4900, codMaxPaise: 2000000, maxQtyPerLine: 10, reservationMinutes: 15, returnWindowDays: 7,
});
