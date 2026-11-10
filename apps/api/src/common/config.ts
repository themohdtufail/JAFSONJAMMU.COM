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
  locationCode: "JAFSON_JAMMU_SHOWROOM",
  freeShippingPaise: 199900, courierFeePaise: 9900, localFeePaise: 4900, localFreeAbovePaise: 99900,
  codFeePaise: 4900, codMaxPaise: 2000000, maxQtyPerLine: 10, reservationMinutes: 15, returnWindowDays: 7,
});
