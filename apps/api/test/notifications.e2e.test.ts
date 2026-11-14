import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";
import { NotificationsService } from "../src/notifications/notifications.service";

/** Fake MSG91 and Resend that record what they receive and can be told to fail. */
let fake: Server, calls: { path: string; query: URLSearchParams; headers: Record<string, any>; body: any }[] = [], failing = false, app: INestApplication, db: PrismaService, svc: NotificationsService; const saved: Record<string, string | undefined> = {};
const A = { "x-admin-key": "test-admin" }; const api = () => request(app.getHttpServer());
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };
let pn = 80; const phone = () => `98763${String(pn++).padStart(5, "0")}`;
const env = (v: Record<string, string>) => { for (const [k, x] of Object.entries(v)) { if (!(k in saved)) saved[k] = process.env[k]; process.env[k] = x; } };

beforeAll(async () => {
  fake = createServer((req, res) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const u = new URL(req.url!, "http://x"); calls.push({ path: u.pathname, query: u.searchParams, headers: req.headers, body: raw ? JSON.parse(raw) : {} });
    if (failing) { res.writeHead(500); return res.end("provider down"); } res.writeHead(200, { "content-type": "application/json" }); res.end('{"type":"success"}'); }); });
  await new Promise<void>((r) => fake.listen(0, r)); const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  env({ SMS_PROVIDER: "msg91", MSG91_AUTH_KEY: "auth-key-1", MSG91_API_BASE: base, MSG91_OTP_TEMPLATE_ID: "otp-tpl", MSG91_TEMPLATES: JSON.stringify({ ORDER_CONFIRMED: "tpl-confirmed", ORDER_DISPATCHED: "tpl-dispatched", ORDER_DELIVERED: "tpl-delivered", ORDER_CANCELLED: "tpl-cancelled" }), EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_key", RESEND_API_BASE: `${base}/resend`, EMAIL_FROM: "Jafson <orders@example.test>", PUBLIC_WEB_URL: "https://shop.example.test" });
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); svc = app.get(NotificationsService);
});
afterAll(async () => { await app.close(); fake.close(); for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); });

const stock = async (sku: string) => { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: 30, reserved: 0, safetyStock: 0 } }); };
async function order(email?: string, method = "COD") { const sku = "JF002-STE-M"; await stock(sku).catch(async () => stock("JF002-STE-M")); const ph = phone(); const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: method, idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: ph, email }, address: addr }); expect(r.status).toBe(201); return { n: r.body.data.number as string, ph }; }
const T = (n: string, to: string) => api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to });
const rowsFor = (n: string) => db.notification.findMany({ where: { dedupeKey: { startsWith: `${n}:` } }, orderBy: { createdAt: "asc" } });
const flushAll = async () => { for (let i = 0; i < 10; i++) { const r = await svc.dispatchDue(50); if (!r.sent && !r.failed) break; } };

describe("order notifications", () => {
  it("queues a confirmation for a COD order (SMS always, email when given) once, and a notice per milestone", async () => {
    const o = await order("asha@example.test"); let rs = await rowsFor(o.n); expect(rs.map((r) => `${r.template}:${r.channel}`).sort()).toEqual(["ORDER_CONFIRMED:EMAIL", "ORDER_CONFIRMED:SMS"]);
    for (const to of ["PICKING", "PACKED", "DISPATCHED"]) await T(o.n, to); await T(o.n, "DELIVERED");
    rs = await rowsFor(o.n); expect(rs.filter((r) => r.channel === "SMS").map((r) => r.template)).toEqual(["ORDER_CONFIRMED", "ORDER_DISPATCHED", "ORDER_DELIVERED"]); // picking and packing are internal
    expect(rs[0]!.payload).toMatchObject({ number: o.n, trackUrl: `https://shop.example.test/order/${o.n}?phone=${o.ph}` });
  });
  it("without an email only the SMS is queued; a cancelled confirmed order is told, an order that never confirmed is not", async () => {
    const o = await order(); expect((await rowsFor(o.n)).map((r) => r.channel)).toEqual(["SMS"]); await api().post(`/v1/admin/orders/${o.n}/cancel`).set(A);
    expect((await rowsFor(o.n)).map((r) => r.template)).toEqual(["ORDER_CONFIRMED", "ORDER_CANCELLED"]);
    const u = await order(undefined, "UPI"); expect(await rowsFor(u.n)).toHaveLength(0); await api().post(`/v1/admin/orders/${u.n}/cancel`).set(A); expect(await rowsFor(u.n)).toHaveLength(0);
  });
  it("sends through MSG91 and Resend with the right content, once, and never twice", async () => {
    calls = []; failing = false; const o = await order("buyer@example.test"); await flushAll();
    const flow = calls.find((c) => c.path === "/api/v5/flow" && JSON.stringify(c.body).includes(o.n))!; expect(flow.headers.authkey).toBe("auth-key-1");
    expect(flow.body).toMatchObject({ template_id: "tpl-confirmed", recipients: [{ mobiles: `91${o.ph}`, order: o.n, name: "Asha" }] });
    const mail = calls.find((c) => c.path === "/resend/emails" && JSON.stringify(c.body).includes(o.n))!; expect(mail.headers.authorization).toBe("Bearer re_key"); expect(mail.body).toMatchObject({ from: "Jafson <orders@example.test>", to: ["buyer@example.test"] }); expect(mail.body.subject).toContain(o.n);
    const n = calls.length; await flushAll(); expect(calls.length).toBe(n); expect((await rowsFor(o.n)).every((r) => r.status === "SENT" && r.sentAt)).toBe(true);
  });
  it("retries with backoff when the provider is down, gives up visibly after repeated failures, and a manager can requeue", async () => {
    await flushAll(); failing = true; const o = await order(); await svc.dispatchDue(50); let [r] = await rowsFor(o.n); expect(r).toMatchObject({ status: "PENDING", attempts: 1 }); expect(r!.lastError).toContain("500"); expect(r!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    const before = calls.length; await svc.dispatchDue(50); expect(calls.length).toBe(before); // backing off: not tried again yet
    for (let i = 0; i < 6; i++) { await db.notification.updateMany({ where: { dedupeKey: { startsWith: `${o.n}:` } }, data: { nextAttemptAt: new Date(Date.now() - 1000) } }); await svc.dispatchDue(50); }
    [r] = await rowsFor(o.n); expect(r!.status).toBe("FAILED"); expect(r!.attempts).toBeGreaterThan(5);
    const list = (await api().get("/v1/admin/notifications?status=FAILED").set(A)).body.data; expect(list.counts.FAILED).toBeGreaterThanOrEqual(1); const item = list.items.find((i: any) => i.lastError); expect(item.recipient).not.toContain(o.ph); expect(item.recipient).toMatch(/\*\*\*/);
    failing = false; expect((await api().post(`/v1/admin/notifications/${r!.id}/retry`).set(A)).status).toBe(200); await flushAll(); expect((await rowsFor(o.n))[0]!.status).toBe("SENT");
    expect((await api().post(`/v1/admin/notifications/${r!.id}/retry`).set(A)).status).toBe(404); // only failed messages can be requeued
  });
  it("staff cannot read the message log", async () => {
    await api().post("/v1/admin/staff").set(A).send({ email: "msg-staff@t.test", name: "Msg Staff", password: "correct-horse-battery", role: "STAFF" });
    const t = (await api().post("/v1/admin/auth/login").send({ email: "msg-staff@t.test", password: "correct-horse-battery" })).body.data.token; expect((await api().get("/v1/admin/notifications").set({ authorization: `Bearer ${t}` })).status).toBe(403);
  });
});

describe("sign-in codes by SMS", () => {
  it("the code is sent through the provider", async () => {
    failing = false; calls = []; const ph = phone(); env({ OTP_DEV_ECHO: "0" }); const r = await api().post("/v1/auth/otp/request").send({ phone: ph }); env({ OTP_DEV_ECHO: "1" }); expect(r.status).toBe(200);
    const c = calls.find((x) => x.path === "/api/v5/otp")!; expect(c.query.get("mobile")).toBe(`91${ph}`); expect(c.query.get("template_id")).toBe("otp-tpl"); expect(c.query.get("otp")).toMatch(/^\d{6}$/); expect(c.headers.authkey).toBe("auth-key-1");
    expect(r.body.data.devCode).toBeUndefined(); // the code is never echoed unless OTP_DEV_ECHO is on
  });
  it("when the provider fails the customer is told, no code is left pending, and the failed attempt does not use up the hourly limit", async () => {
    failing = true; const ph = phone();
    for (let i = 0; i < 6; i++) { const r = await api().post("/v1/auth/otp/request").send({ phone: ph }); expect(r.status).toBe(503); expect(r.body.error.code).toBe("SMS_UNAVAILABLE"); }
    expect(await db.otpChallenge.count({ where: { phone: ph } })).toBe(0); failing = false; expect((await api().post("/v1/auth/otp/request").send({ phone: ph })).status).toBe(200);
  });
  it("in production a missing SMS provider is refused rather than pretended", async () => {
    env({ SMS_PROVIDER: "log", NODE_ENV: "production" }); try { const ph = phone(); const r = await api().post("/v1/auth/otp/request").send({ phone: ph }); expect(r.status).toBe(503); expect(await db.otpChallenge.count({ where: { phone: ph } })).toBe(0); }
    finally { process.env.NODE_ENV = "test"; env({ SMS_PROVIDER: "msg91" }); }
  });
});
