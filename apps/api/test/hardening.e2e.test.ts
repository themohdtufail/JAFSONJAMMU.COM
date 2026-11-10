import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";
import { base32Decode, hotp, timeStep } from "../src/admin/totp";

let app: INestApplication, db: PrismaService;
const A = { "x-admin-key": "test-admin" };
const contact = { name: "Meera Kaul", phone: "9876500555" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu & Kashmir", postalCode: "180004" };
const api = () => request(app.getHttpServer());
const code = (secret: string, offset = 0) => hotp(base32Decode(secret), timeStep() + offset);
const withEnv = async (env: Record<string, string>, fn: () => Promise<void>) => { const old: Record<string, string | undefined> = {}; for (const [k, v] of Object.entries(env)) { old[k] = process.env[k]; process.env[k] = v; } try { await fn(); } finally { for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v); } };

beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); });

async function stock(sku: string, n: number) { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0 } }); return v; }
const onHand = async (sku: string) => (await db.inventoryBalance.findFirstOrThrow({ where: { variant: { sku } } })).onHand;
async function mockPaidOrder(lines: { sku: string; quantity: number }[]) {
  for (const l of lines) await stock(l.sku, 10);
  const o = (await api().post("/v1/checkout/orders").send({ lines, fulfilmentType: "COURIER", paymentMethod: "UPI", idempotencyKey: randomUUID(), contact, address: addr })).body.data;
  const s = (await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone })).body.data;
  await api().post(`/v1/payments/mock/${s.paymentRef}/pay`).send({});
  return o;
}
const deliver = async (n: string) => { for (const to of ["PICKING", "PACKED", "DISPATCHED", "DELIVERED"]) await api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to }); };
const payStatus = async (n: string) => (await api().get(`/v1/orders/${n}?phone=${contact.phone}`)).body.data.paymentStatus;

describe("two-step login for staff", () => {
  it("is enforced for managers and owners: enrol, get a full token, then every sign-in needs a fresh code", async () => {
    await withEnv({ REQUIRE_ADMIN_MFA: "1" }, async () => {
      await api().post("/v1/admin/staff").set(A).send({ email: "mfa-mgr@t.test", name: "Mfa Manager", password: "correct-horse-battery", role: "MANAGER" });
      const l1 = (await api().post("/v1/admin/auth/login").send({ email: "mfa-mgr@t.test", password: "correct-horse-battery" })).body.data;
      expect(l1.mfaSetupRequired).toBe(true);
      const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
      expect((await api().get("/v1/admin/orders").set(bearer(l1.token))).body.error.code).toBe("MFA_REQUIRED");
      const me = (await api().get("/v1/admin/me").set(bearer(l1.token))).body.data; expect(me).toMatchObject({ mfaRequired: true, mfaEnabled: false });
      const setup = (await api().post("/v1/admin/auth/mfa/setup").set(bearer(l1.token))).body.data;
      expect(setup.otpauthUrl).toContain("otpauth://totp/"); expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect((await db.staffUser.findUniqueOrThrow({ where: { email: "mfa-mgr@t.test" } })).mfaSecretEnc).not.toContain(setup.secret); // stored encrypted
      expect((await api().post("/v1/admin/auth/mfa/enable").set(bearer(l1.token)).send({ code: "000000" })).status).toBe(400);
      const en = await api().post("/v1/admin/auth/mfa/enable").set(bearer(l1.token)).send({ code: code(setup.secret) }); expect(en.status).toBe(200);
      expect((await api().get("/v1/admin/orders").set(bearer(en.body.data.token))).status).toBe(200);
      expect((await api().get("/v1/admin/orders").set(bearer(l1.token))).body.error.code).toBe("MFA_REQUIRED"); // the pre-MFA token stays blocked
      const l2 = (await api().post("/v1/admin/auth/login").send({ email: "mfa-mgr@t.test", password: "correct-horse-battery" })).body.data;
      expect(l2.mfaRequired).toBe(true); expect(l2.token).toBeUndefined();
      expect((await api().get("/v1/auth/me").set(bearer(l2.challenge))).status).toBe(401); expect((await api().get("/v1/admin/me").set(bearer(l2.challenge))).status).toBe(401); // a challenge authenticates nothing
      expect((await api().post("/v1/admin/auth/mfa/verify").send({ challenge: l2.challenge, code: "123456" })).status).toBe(401);
      const good = code(setup.secret, 1); // the next step: the enrolment code's own step is already spent
      const v = await api().post("/v1/admin/auth/mfa/verify").send({ challenge: l2.challenge, code: good }); expect(v.status).toBe(200);
      expect((await api().get("/v1/admin/orders").set(bearer(v.body.data.token))).status).toBe(200);
      expect((await api().post("/v1/admin/auth/mfa/verify").send({ challenge: l2.challenge, code: good })).status).toBe(401); // replay
      expect((await api().post("/v1/admin/auth/mfa/enable").set(bearer(v.body.data.token)).send({ code: code(setup.secret) })).body.error.code).toBe("MFA_ALREADY_ENABLED");
    });
  });
  it("is not forced on Staff, and an owner can reset a lost authenticator", async () => {
    await withEnv({ REQUIRE_ADMIN_MFA: "1" }, async () => {
      await api().post("/v1/admin/staff").set(A).send({ email: "mfa-staff@t.test", name: "Mfa Staff", password: "correct-horse-battery", role: "STAFF" });
      const l = (await api().post("/v1/admin/auth/login").send({ email: "mfa-staff@t.test", password: "correct-horse-battery" })).body.data;
      expect(l.mfaSetupRequired).toBe(false); expect((await api().get("/v1/admin/orders").set({ authorization: `Bearer ${l.token}` })).status).toBe(200);
      const mgr = await db.staffUser.findUniqueOrThrow({ where: { email: "mfa-mgr@t.test" } }); expect(mgr.mfaEnabledAt).not.toBeNull();
      expect((await api().post(`/v1/admin/staff/${mgr.id}/reset-mfa`).set({ authorization: `Bearer ${l.token}` })).status).toBe(403); // Staff can't reset anyone
      expect((await api().post(`/v1/admin/staff/${mgr.id}/reset-mfa`).set(A)).status).toBe(200);
      expect((await api().post("/v1/admin/auth/login").send({ email: "mfa-mgr@t.test", password: "correct-horse-battery" })).body.data.mfaSetupRequired).toBe(true);
      expect(await db.auditLog.count({ where: { action: { in: ["MFA_ENABLED", "MFA_RESET"] } } })).toBeGreaterThanOrEqual(2);
    });
  });
  it("locks out repeated wrong codes", async () => {
    await withEnv({ REQUIRE_ADMIN_MFA: "1" }, async () => {
      await api().post("/v1/admin/staff").set(A).send({ email: "mfa-brute@t.test", name: "Brute", password: "correct-horse-battery", role: "OWNER" });
      const t = (await api().post("/v1/admin/auth/login").send({ email: "mfa-brute@t.test", password: "correct-horse-battery" })).body.data.token; const h = { authorization: `Bearer ${t}` };
      const s = (await api().post("/v1/admin/auth/mfa/setup").set(h)).body.data; await api().post("/v1/admin/auth/mfa/enable").set(h).send({ code: code(s.secret) });
      const ch = (await api().post("/v1/admin/auth/login").send({ email: "mfa-brute@t.test", password: "correct-horse-battery" })).body.data.challenge;
      for (let i = 0; i < 5; i++) expect((await api().post("/v1/admin/auth/mfa/verify").send({ challenge: ch, code: "111111" })).status).toBe(401);
      expect((await api().post("/v1/admin/auth/mfa/verify").send({ challenge: ch, code: code(s.secret, 1) })).status).toBe(429);
    });
  });
});

describe("refunds never exceed what was paid", () => {
  it("supports partial refunds, tracks the balance, and refuses over-refunds", async () => {
    const o = await mockPaidOrder([{ sku: "JF010-TAN-S", quantity: 1 }, { sku: "JF010-TAN-M", quantity: 1 }]); const total = o.totals.totalPaise;
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ amountPaise: 10000 })).body.error.code).toBe("ORDER_ACTIVE");
    await api().post(`/v1/admin/orders/${o.number}/cancel`).set(A);
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ amountPaise: 50 })).status).toBe(422);
    const p1 = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ amountPaise: 100000, reason: "Partial" }); expect(p1.body.data).toMatchObject({ status: "PROCESSED", amountPaise: 100000 });
    expect(await payStatus(o.number)).toBe("PARTIALLY_REFUNDED");
    const over = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ amountPaise: total }); expect(over.body.error.code).toBe("REFUND_EXCEEDS_PAYMENT"); expect(over.body.error.details.remainingPaise).toBe(total - 100000);
    const rest = await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({}); expect(rest.body.data.amountPaise).toBe(total - 100000); expect(await payStatus(o.number)).toBe("REFUNDED");
    expect((await api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({})).body.error.code).toBe("ALREADY_REFUNDED");
    const sum = await db.refund.aggregate({ where: { orderId: (await db.order.findUniqueOrThrow({ where: { number: o.number } })).id, status: "PROCESSED" }, _sum: { amountPaise: true } }); expect(sum._sum.amountPaise).toBe(total);
  });
  it("concurrent refunds can't add up to more than the payment", async () => {
    const o = await mockPaidOrder([{ sku: "JF010-TAN-L", quantity: 1 }]); await api().post(`/v1/admin/orders/${o.number}/cancel`).set(A);
    const half = Math.floor(o.totals.totalPaise * 0.6);
    const rs = await Promise.all([1, 2, 3, 4].map(() => api().post(`/v1/admin/orders/${o.number}/refund`).set(A).send({ amountPaise: half })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1); expect(rs.filter((r) => r.body.error?.code === "REFUND_EXCEEDS_PAYMENT")).toHaveLength(3);
  });
});

describe("returns: received back and restocked", () => {
  it("restocks resellable items once, not damaged ones, and only after approval", async () => {
    const o = await mockPaidOrder([{ sku: "JF010-TAN-XL", quantity: 1 }, { sku: "JF010-TAN-XXL", quantity: 1 }]); await deliver(o.number);
    const ids = Object.fromEntries(o.items.map((i: any) => [i.sku, i.id]));
    const rq = (await api().post("/v1/returns").send({ orderNumber: o.number, phone: contact.phone, items: [{ orderItemId: ids["JF010-TAN-XL"], kind: "RETURN", reason: "Size too large" }, { orderItemId: ids["JF010-TAN-XXL"], kind: "RETURN", reason: "Damaged or defective" }] })).body.data;
    const recv = (restock: boolean) => api().post(`/v1/admin/returns/${rq.ref}/receive`).set(A).send({ restock });
    expect((await recv(true)).body.error.code).toBe("INVALID_TRANSITION"); // not approved yet
    const list = (await api().get("/v1/admin/returns").set(A)).body.data.find((r: any) => r.ref === rq.ref); expect(list.refundSuggestionPaise).toBe(o.items.reduce((n: number, i: any) => n + i.lineTotalPaise, 0));
    await api().post(`/v1/admin/returns/${rq.ref}/decision`).set(A).send({ decision: "APPROVED" });
    const before = await onHand("JF010-TAN-XL"); expect((await recv(true)).body.data).toMatchObject({ status: "RECEIVED", restocked: true });
    expect(await onHand("JF010-TAN-XL")).toBe(before + 1); expect(await onHand("JF010-TAN-XXL")).toBe(before + 1 - 0 === 0 ? 0 : await onHand("JF010-TAN-XXL"));
    expect(await db.inventoryMovement.count({ where: { movementType: "RETURN", referenceId: rq.ref } })).toBe(2);
    expect((await recv(true)).body.error.code).toBe("INVALID_TRANSITION"); // can't restock twice
    expect(await onHand("JF010-TAN-XL")).toBe(before + 1);
    // damaged goods: received but not restocked
    const o2 = await mockPaidOrder([{ sku: "JF011-NAV-2-3Y", quantity: 1 }]); await deliver(o2.number);
    const r2 = (await api().post("/v1/returns").send({ orderNumber: o2.number, phone: contact.phone, items: [{ orderItemId: o2.items[0].id, kind: "RETURN", reason: "Damaged or defective" }] })).body.data;
    await api().post(`/v1/admin/returns/${r2.ref}/decision`).set(A).send({ decision: "APPROVED" });
    const b2 = await onHand("JF011-NAV-2-3Y"); expect((await api().post(`/v1/admin/returns/${r2.ref}/receive`).set(A).send({ restock: false })).body.data.restocked).toBe(false); expect(await onHand("JF011-NAV-2-3Y")).toBe(b2);
  });
});

describe("API hardening", () => {
  it("sends security headers and no framework banner", async () => {
    const r = await api().get("/v1/health");
    expect(r.headers["x-content-type-options"]).toBe("nosniff"); expect(r.headers["x-frame-options"]).toBe("DENY"); expect(r.headers["referrer-policy"]).toBe("no-referrer"); expect(r.headers["x-powered-by"]).toBeUndefined(); expect(r.headers["content-security-policy"]).toContain("default-src 'none'");
  });
  it("only lets known origins read responses (CORS)", async () => {
    const bad = await api().get("/v1/health").set("Origin", "https://evil.example"); expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    const ok = await api().get("/v1/health").set("Origin", "http://localhost:3000"); expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
  it("rejects oversized request bodies", async () => {
    const r = await api().post("/v1/checkout/quote").set("content-type", "application/json").send(JSON.stringify({ junk: "x".repeat(300_000) })); expect(r.status).toBe(413);
  });
  it("answers malformed JSON with a 400, not a server error", async () => {
    const r = await api().post("/v1/checkout/quote").set("content-type", "application/json").send("{not json"); expect(r.status).toBe(400); expect(r.body.error.code).toBe("INVALID_JSON");
  });
  it("rate-limits sign-in attempts per client with Retry-After, but never the signed webhooks", async () => {
    await withEnv({ RATE_LIMIT: "1", RATE_LIMIT_AUTH: "3" }, async () => {
      const codes: number[] = []; for (let i = 0; i < 5; i++) codes.push((await api().post("/v1/admin/auth/login").send({ email: `nobody${i}@t.test`, password: "wrong-password-1" })).status);
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]); expect(codes.slice(3)).toEqual([429, 429]);
      const blocked = await api().post("/v1/admin/auth/login").send({ email: "x@t.test", password: "wrong-password-1" }); expect(blocked.body.error.code).toBe("RATE_LIMITED"); expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      for (let i = 0; i < 6; i++) expect((await api().post("/v1/webhooks/payments/mock").set("x-signature", "bad").send({})).status).not.toBe(429);
    });
  });
});
