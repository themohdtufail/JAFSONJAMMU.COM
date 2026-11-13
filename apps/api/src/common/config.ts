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
  trustProxy: process.env.TRUST_PROXY === "1",
  isProd: process.env.NODE_ENV === "production",
  /** Seller details printed on invoices. The GSTIN stays empty until the company is registered and it is confirmed: nothing is invented. */
  seller: { legalName: process.env.SELLER_LEGAL_NAME ?? "Chameron Industries Private Limited", gstin: process.env.SELLER_GSTIN ?? "", cin: process.env.SELLER_CIN ?? "", address: process.env.SELLER_ADDRESS ?? "" },
  locationCode: "JAFSON_JAMMU_SHOWROOM",
  freeShippingPaise: 199900, courierFeePaise: 9900, localFeePaise: 4900, localFreeAbovePaise: 99900,
  codFeePaise: 4900, codMaxPaise: 2000000, maxQtyPerLine: 10, reservationMinutes: 15, returnWindowDays: 7,
});
