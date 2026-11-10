import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

/** A fake Razorpay API that records what we send and answers like the real one (orders, refunds), so the integration is exercised end to end. */
let fake: Server, calls: { path: string; auth: string; body: any }[] = [], failNext = "", app: INestApplication, db: PrismaService;
const KEY = "rzp_test_key", SECRET = "key_secret_value", WH = "webhook_secret_value";
const A = { "x-admin-key": "test-admin" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu & Kashmir", postalCode: "180004" };
const contact = { name: "Asha Verma", phone: "9876500077" };
const api = () => request(app.getHttpServer());
const h = (s: string, d: string) => createHmac("sha256", s).update(d).digest("hex");
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {}; calls.push({ path: req.url!, auth: String(req.headers.authorization), body });
      const send = (code: number, j: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
      if (failNext) { const f = failNext; failNext = ""; return send(400, { error: { code: "BAD_REQUEST_ERROR", description: f } }); }
      if (req.url === "/v1/orders") return send(200, { id: `order_${randomUUID().slice(0, 10)}`, amount: body.amount, currency: "INR", receipt: body.receipt });
      if (/^\/v1\/payments\/[^/]+\/refund$/.test(req.url!)) return send(200, { id: `rfnd_${randomUUID().slice(0, 10)}`, amount: body.amount, status: "processed" });
      send(404, {});
    });
  });
  await new Promise<void>((r) => fake.listen(0, r));
  for (const [k, v] of Object.entries({ PAYMENTS_PROVIDER: "razorpay", RAZORPAY_KEY_ID: KEY, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WH, RAZORPAY_API_BASE: `http://127.0.0.1:${(fake.address() as AddressInfo).port}` })) { saved[k] = process.env[k]; process.env[k] = v; }
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService);
});
afterAll(async () => { await app.close(); fake.close(); for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); });

async function upiOrder(sku: string, stock = 5) {
  const v = await db.productVariant.findUniqueOrThrow({ where: { sku } });
  await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: stock, reserved: 0 } });
  const o = (await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "UPI", idempotencyKey: randomUUID(), contact, address: addr })).body.data;
  const s = await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone });
  return { o, s };
}
const cancel = (n: string) => api().post(`/v1/admin/orders/${n}/cancel`).set(A);
const status = async (n: string) => (await api().get(`/v1/orders/${n}?phone=${contact.phone}`)).body.data;
const hook = (event: object, secret = WH, eid: string = randomUUID(), sigOverride?: string) => { const raw = JSON.stringify(event); return api().post("/v1/webhooks/payments/razorpay").set("content-type", "application/json").set("x-razorpay-event-id", eid).set("x-razorpay-signature", sigOverride ?? h(secret, raw)).send(raw); };
const captured = (orderId: string, payId: string, amount: number) => ({ event: "payment.captured", payload: { payment: { entity: { id: payId, order_id: orderId, amount, method: "upi", status: "captured" } } } });

describe("Razorpay integration", () => {
  it("creates the provider order server-side for the exact order total, with basic auth, and returns only public checkout data", async () => {
    calls = []; const { o, s } = await upiOrder("JF013-GRE-4-5Y");
    expect(s.status).toBe(200); expect(s.body.data).toMatchObject({ provider: "RAZORPAY", keyId: KEY, currency: "INR", amountPaise: o.totals.totalPaise, orderNumber: o.number });
    expect(s.body.data.paymentRef).toMatch(/^order_/); expect(JSON.stringify(s.body)).not.toContain(SECRET);
    const c = calls.find((x) => x.path === "/v1/orders")!;
    expect(c.body).toMatchObject({ amount: o.totals.totalPaise, currency: "INR", receipt: o.number }); expect(c.auth).toBe(`Basic ${Buffer.from(`${KEY}:${SECRET}`).toString("base64")}`);
    const again = await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone }); // resuming reuses the same provider order
    expect(again.body.data.paymentRef).toBe(s.body.data.paymentRef); expect(calls.filter((x) => x.path === "/v1/orders")).toHaveLength(1);
  });
  it("confirms the order from a correctly signed checkout response, and rejects forged or mismatched ones", async () => {
    const { o, s } = await upiOrder("JF013-GRE-6-7Y"); const rid = s.body.data.paymentRef, pid = "pay_ABC12345678";
    const body = { orderNumber: o.number, phone: contact.phone, razorpay_order_id: rid, razorpay_payment_id: pid };
    expect((await api().post("/v1/payments/verify").send({ ...body, razorpay_signature: "0".repeat(64) })).body.error.code).toBe("INVALID_SIGNATURE");
    expect((await api().post("/v1/payments/verify").send({ ...body, razorpay_signature: h("wrong_secret", `${rid}|${pid}`) })).body.error.code).toBe("INVALID_SIGNATURE");
    expect((await status(o.number)).status).toBe("PENDING_PAYMENT");
    const ok = await api().post("/v1/payments/verify").send({ ...body, razorpay_signature: h(SECRET, `${rid}|${pid}`) });
    expect(ok.status).toBe(200); expect(ok.body.data.order).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
    const other = await upiOrder("JF013-GRE-8-9Y"); // a valid signature for someone else's provider order must not confirm this order
    expect((await api().post("/v1/payments/verify").send({ orderNumber: other.o.number, phone: contact.phone, razorpay_order_id: rid, razorpay_payment_id: pid, razorpay_signature: h(SECRET, `${rid}|${pid}`) })).body.error.code).toBe("PAYMENT_NOT_FOUND");
    expect((await db.payment.findFirstOrThrow({ where: { providerRef: rid } })).providerPaymentId).toBe(pid);
  });
  it("webhook: rejects bad signatures, confirms once, ignores duplicates, and checks the amount", async () => {
    const { o, s } = await upiOrder("JF013-GRE-10-11Y"); const rid = s.body.data.paymentRef, amt = o.totals.totalPaise;
    expect((await hook(captured(rid, "pay_W1", amt), "wrong")).status).toBe(401);
    expect((await hook(captured(rid, "pay_W1", amt), WH, "e1", "deadbeef")).status).toBe(401);
    const bad = await hook(captured(rid, "pay_W1", 100)); expect(bad.body.data.status).toBe("AMOUNT_MISMATCH"); expect((await status(o.number)).status).toBe("PENDING_PAYMENT");
    const ev = captured(rid, "pay_W1", amt); const eid = `evt_${randomUUID()}`;
    expect((await hook(ev, WH, eid)).body.data.status).toBe("CONFIRMED"); expect((await hook(ev, WH, eid)).body.data.status).toBe("DUPLICATE");
    expect((await hook(captured(rid, "pay_W1", amt))).body.data.status).toBe("ALREADY_CAPTURED"); // same capture under a new event id
    expect(await status(o.number)).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
    expect((await hook({ event: "settlement.processed", payload: {} })).body.data.status).toBe("IGNORED");
  });
  it("a provider payment id that is already attached to another payment is refused cleanly, not with a 500 that makes Razorpay retry forever", async () => {
    const a = await upiOrder("JF008-RUS-4".replace("RUS-4", "OAT-XL")); await hook(captured(a.s.body.data.paymentRef, "pay_SHARED1", a.o.totals.totalPaise));
    const b = await upiOrder("JF008-OAT-XXL"); const r = await hook(captured(b.s.body.data.paymentRef, "pay_SHARED1", b.o.totals.totalPaise));
    expect(r.status).toBe(200); expect(r.body.data.status).toBe("PAYMENT_ID_CONFLICT"); expect((await status(b.o.number)).status).toBe("PENDING_PAYMENT");
  });
  it("a failed payment keeps the order open for a retry on the same provider order", async () => {
    const { o, s } = await upiOrder("JF008-OAT-S"); const rid = s.body.data.paymentRef;
    const f = await hook({ event: "payment.failed", payload: { payment: { entity: { id: "pay_F1", order_id: rid, amount: o.totals.totalPaise } } } }); expect(f.body.data.status).toBe("FAILED_RECORDED");
    expect((await status(o.number)).status).toBe("PENDING_PAYMENT");
    expect((await hook(captured(rid, "pay_F2", o.totals.totalPaise))).body.data.status).toBe("CONFIRMED");
  });
  it("money that arrives after the order expired is flagged for refund, then refunded through the provider exactly once", async () => {
    const { o, s } = await upiOrder("JF009-WHI-S", 3); const rid = s.body.data.paymentRef;
    await db.order.update({ where: { number: o.number }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await api().post("/v1/admin/jobs/expire-reservations").set(A); expect((await status(o.number)).status).toBe("CANCELLED");
    await hook(captured(rid, "pay_LATE1", o.totals.totalPaise)); expect((await status(o.number)).paymentStatus).toBe("REFUND_DUE");
    calls = []; const r1 = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ reason: "Paid after expiry" });
    expect(r1.status).toBe(200); expect(r1.body.data).toMatchObject({ status: "PROCESSED", amountPaise: o.totals.totalPaise });
    expect(calls[0]).toMatchObject({ path: "/v1/payments/pay_LATE1/refund" }); expect(calls[0]!.body.amount).toBe(o.totals.totalPaise);
    expect((await status(o.number)).paymentStatus).toBe("REFUNDED");
    const r2 = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({}); expect(r2.body.error.code).toBe("ALREADY_REFUNDED"); expect(calls).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "REFUND_INITIATED", entityId: o.number } })).toBe(1);
  });
  it("double-clicking refund sends one refund to the provider", async () => {
    const { o, s } = await upiOrder("JF009-SKY-S", 3); await hook(captured(s.body.data.paymentRef, "pay_DBL1", o.totals.totalPaise)); await cancel(o.number); calls = [];
    const rs = await Promise.all([1, 2, 3].map(() => api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({})));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1); expect(calls.filter((c) => c.path.endsWith("/refund"))).toHaveLength(1);
  });
  it("a provider error on refund is reported, leaves the order unchanged, and can be retried", async () => {
    const { o, s } = await upiOrder("JF009-SKY-L", 3); await hook(captured(s.body.data.paymentRef, "pay_ERR1", o.totals.totalPaise)); await cancel(o.number);
    failNext = "The payment has not been captured yet";
    const bad = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({}); expect(bad.status).toBe(502); expect(bad.body.error.code).toBe("PAYMENT_PROVIDER_ERROR");
    expect((await status(o.number)).paymentStatus).toBe("REFUND_PENDING");
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({})).status).toBe(200);
  });
  it("refund webhooks update the refund and order; COD orders can't be refunded online; refunds need manager access", async () => {
    const { o, s } = await upiOrder("JF009-SKY-XL", 3); await hook(captured(s.body.data.paymentRef, "pay_RW1", o.totals.totalPaise));
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`)).status).toBe(401);
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({})).body.error.code).toBe("ORDER_ACTIVE"); // still being fulfilled
    await cancel(o.number);
    const r = (await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({})).body.data;
    await db.order.update({ where: { number: o.number }, data: { paymentStatus: "REFUND_PENDING" } }); await db.refund.updateMany({ where: { providerRefundId: r.refundId }, data: { status: "PENDING" } });
    const ev = await hook({ event: "refund.processed", payload: { refund: { entity: { id: r.refundId, payment_id: "pay_RW1", amount: o.totals.totalPaise, status: "processed" } } } });
    expect(ev.body.data.status).toBe("REFUND_PROCESSED"); expect((await status(o.number)).paymentStatus).toBe("REFUNDED");
    await db.inventoryBalance.updateMany({ where: { variant: { sku: "JF009-WHI-M" } }, data: { onHand: 5, reserved: 0 } });
    const cod = (await api().post("/v1/checkout/orders").send({ lines: [{ sku: "JF009-WHI-M", quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact, address: addr })).body.data;
    await cancel(cod.number);
    expect((await api().post(`/v1/admin/orders/${cod.number}/refund`).set(A).send({})).body.error.code).toBe("NOT_REFUNDABLE_ONLINE");
  });
  it("unconfigured keys fail clearly instead of silently falling back to the mock", async () => {
    const k = process.env.RAZORPAY_KEY_ID; process.env.RAZORPAY_KEY_ID = "";
    const { o } = await (async () => { const v = await db.productVariant.findUniqueOrThrow({ where: { sku: "JF009-WHI-L" } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: 5, reserved: 0 } }); return { o: (await api().post("/v1/checkout/orders").send({ lines: [{ sku: "JF009-WHI-L", quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "UPI", idempotencyKey: randomUUID(), contact, address: addr })).body.data }; })();
    const r = await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone }); process.env.RAZORPAY_KEY_ID = k;
    expect(r.status).toBe(503); expect(r.body.error.code).toBe("PAYMENTS_NOT_CONFIGURED");
  });
});
