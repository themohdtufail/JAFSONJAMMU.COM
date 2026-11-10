export const cfg = () => ({
  jwtSecret: process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET required"); })() : "dev-secret-dev-secret-dev-secret"),
  adminKey: process.env.ADMIN_API_KEY ?? "",
  billOsKey: process.env.BILL_OS_API_KEY ?? "",
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
  paymentsMock: process.env.PAYMENTS_MOCK === "1",
  otpDevEcho: process.env.OTP_DEV_ECHO === "1",
  locationCode: "JAFSON_JAMMU_SHOWROOM",
  freeShippingPaise: 199900, courierFeePaise: 9900, localFeePaise: 4900, localFreeAbovePaise: 99900,
  codFeePaise: 4900, codMaxPaise: 2000000, maxQtyPerLine: 10, reservationMinutes: 15, returnWindowDays: 7,
});
