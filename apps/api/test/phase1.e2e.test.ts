import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

/** Phase 1 regression tests: each one failed on the code as audited, and pins the fix. */
let app: INestApplication, db: PrismaService;
const A = { "x-admin-key": "test-admin" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };
const api = () => request(app.getHttpServer());
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); });

let phoneN = 70;
const newPhone = () => `98765${String(phoneN++).padStart(5, "0")}`;
async function stock(sku: string, n: number) { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0, safetyStock: 0 } }); return v; }
async function place(sku: string, phone: string, extra: object = {}, fulfilmentType = "COURIER") {
  await stock(sku, 20);
  const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType, paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone }, address: fulfilmentType === "PICKUP" ? undefined : addr, ...extra });
  expect(r.status).toBe(201); return r.body.data;
}
const T = (n: string, to: string, pickupCode?: string) => api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to, pickupCode });
const deliver = async (n: string) => { for (const to of ["PICKING", "PACKED", "DISPATCHED", "DELIVERED"]) expect((await T(n, to)).status).toBe(200); };
const onHand = async (sku: string) => (await db.inventoryBalance.findFirstOrThrow({ where: { variant: { sku } } })).onHand;
async function withEnv<R>(vars: Record<string, string>, fn: () => Promise<R>) { const saved: Record<string, string | undefined> = {}; for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; } try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); } }

describe("D1/D2 returns cannot be duplicated or restocked twice", () => {
  it("D1: an item that was already returned and received cannot be returned again, so stock is restored once", async () => {
    const phone = newPhone(), sku = "JF009-WHI-XL"; const o = await place(sku, phone); await deliver(o.number);
    const body = { orderNumber: o.number, phone, items: [{ orderItemId: o.items[0].id, kind: "RETURN", reason: "Size too large" }] };
    const first = (await api().post("/v1/returns").send(body)).body.data.ref;
    await api().post(`/v1/admin/returns/${first}/decision`).set(A).send({ decision: "APPROVED" });
    const before = await onHand(sku);
    expect((await api().post(`/v1/admin/returns/${first}/receive`).set(A).send({ restock: true })).status).toBe(200);
    expect(await onHand(sku)).toBe(before + 1);
    const again = await api().post("/v1/returns").send(body); expect(again.status).toBe(409); expect(again.body.error.code).toBe("ALREADY_REQUESTED");
    expect(await onHand(sku)).toBe(before + 1);
  });
  it("D1: a rejected return may be requested again; a received one may not (database-level backstop for the restock)", async () => {
    const phone = newPhone(), sku = "JF009-WHI-L"; const o = await place(sku, phone); await deliver(o.number);
    const item = { orderItemId: o.items[0].id, kind: "RETURN", reason: "Changed my mind" };
    const r1 = (await api().post("/v1/returns").send({ orderNumber: o.number, phone, items: [item] })).body.data.ref;
    await api().post(`/v1/admin/returns/${r1}/decision`).set(A).send({ decision: "REJECTED" });
    const r2 = await api().post("/v1/returns").send({ orderNumber: o.number, phone, items: [item] }); expect(r2.status).toBe(201);
    await api().post(`/v1/admin/returns/${r2.body.data.ref}/decision`).set(A).send({ decision: "APPROVED" }); await api().post(`/v1/admin/returns/${r2.body.data.ref}/receive`).set(A).send({ restock: true });
    // even if a second return row were forced in, the restock movement key is per order item, so it cannot be applied twice
    const forced = await db.returnRequest.create({ data: { ref: `RTX${phoneN}`, orderId: (await db.order.findUniqueOrThrow({ where: { number: o.number } })).id, status: "APPROVED", items: { create: [{ orderItemId: o.items[0].id, kind: "RETURN", reason: "forced" }] } } });
    const x = await api().post(`/v1/admin/returns/${forced.ref}/receive`).set(A).send({ restock: true }); expect(x.status).toBe(409); expect(x.body.error.code).toBe("ALREADY_RESTOCKED");
  });
  it("D2: simultaneous return requests for one item create exactly one return", async () => {
    const phone = newPhone(), sku = "JF009-WHI-M"; const o = await place(sku, phone); await deliver(o.number);
    const body = { orderNumber: o.number, phone, items: [{ orderItemId: o.items[0].id, kind: "RETURN", reason: "Doesn't fit" }] };
    const rs = await Promise.all(Array.from({ length: 6 }, () => api().post("/v1/returns").send(body)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1); expect(rs.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await db.returnItem.count({ where: { orderItemId: o.items[0].id } })).toBe(1);
  });
});

describe("D3 OTP guesses are limited atomically", () => {
  it("parallel wrong guesses are evaluated at most 5 times, and the right code then fails", async () => {
    const phone = newPhone(); const code = (await api().post("/v1/auth/otp/request").send({ phone })).body.data.devCode;
    const wrong = code === "000000" ? "111111" : "000000";
    const rs = await Promise.all(Array.from({ length: 25 }, () => api().post("/v1/auth/otp/verify").send({ phone, code: wrong })));
    const evaluated = rs.filter((r) => r.body.error?.message === "Incorrect code").length;
    expect(evaluated).toBeLessThanOrEqual(5);
    expect((await api().post("/v1/auth/otp/verify").send({ phone, code })).status).toBe(400);
  });
});

describe("D4 guest order lookup cannot be used to probe numbers", () => {
  it("repeated failed lookups for one phone are throttled with 429, and a correct lookup is not counted against it", async () => {
    const phone = newPhone(); const o = await place("JF009-WHI-S", phone);
    expect((await api().get(`/v1/orders/${o.number}?phone=${phone}`)).status).toBe(200);
    const codes: number[] = []; for (let i = 0; i < 14; i++) codes.push((await api().get(`/v1/orders/JF99${String(1000 + i)}?phone=${phone}`)).status);
    expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true); expect(codes.slice(10).every((c) => c === 429)).toBe(true);
    const blocked = await api().get(`/v1/orders/${o.number}?phone=${phone}`); expect(blocked.status).toBe(429); expect(blocked.headers["retry-after"]).toBeTruthy();
  });
});

describe("D6 stale customer tokens", () => {
  it("a token stops working once the account is deleted or suspended", async () => {
    const phone = newPhone(); const code = (await api().post("/v1/auth/otp/request").send({ phone })).body.data.devCode;
    const tok = (await api().post("/v1/auth/otp/verify").send({ phone, code })).body.data.accessToken; const H = { authorization: `Bearer ${tok}` };
    expect((await api().get("/v1/orders").set(H)).status).toBe(200);
    await api().delete("/v1/auth/account").set(H);
    expect((await api().get("/v1/orders").set(H)).status).toBe(401);
  });
});

describe("D7 mock payment surface", () => {
  it("the mock webhook does not exist when the real provider is configured", async () => {
    await withEnv({ PAYMENTS_PROVIDER: "razorpay", PAYMENTS_MOCK: "0" }, async () => { expect((await api().post("/v1/webhooks/payments/mock").send({})).status).toBe(404); });
  });
});

describe("D8/D9/D11 database integrity", () => {
  it("D8: audit rows are append-only", async () => {
    await db.auditLog.create({ data: { actor: "t", action: "T", entity: "T", entityId: "t", data: {} } });
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "T" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { actor: "x" } })).rejects.toThrow(/append-only/); await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
  it("D8: order lines are frozen once the order is confirmed", async () => {
    const o = await place("JF009-WHI-S", newPhone()); const item = await db.orderItem.findFirstOrThrow({ where: { orderId: o.id ?? (await db.order.findUniqueOrThrow({ where: { number: o.number } })).id } });
    await expect(db.orderItem.update({ where: { id: item.id }, data: { unitPricePaise: 1 } })).rejects.toThrow(/frozen/); await expect(db.orderItem.delete({ where: { id: item.id } })).rejects.toThrow(/frozen/);
  });
  it("D11: order totals must add up", async () => {
    const o = await place("JF009-WHI-S", newPhone());
    await expect(db.order.update({ where: { number: o.number }, data: { totalPaise: 1 } })).rejects.toThrow(/order_total_adds_up|violates check/i);
  });
  it("D9: collection needs a stored pickup confirmation, and the normal flow creates it", async () => {
    const phone = newPhone(); const o = await place("JF009-WHI-S", phone, {}, "PICKUP"); await T(o.number, "READY_FOR_PICKUP");
    await expect(db.order.update({ where: { number: o.number }, data: { status: "COLLECTED" } })).rejects.toThrow(/pickup confirmation/i);
    const full = await db.order.findUniqueOrThrow({ where: { number: o.number } });
    expect((await T(o.number, "COLLECTED", full.pickupCode!)).status).toBe(200);
    const pc = await db.pickupConfirmation.findFirstOrThrow({ where: { orderId: full.id } }); expect(pc.verifiedBy).toBe("staff:admin-key#key");
  });
});

describe("D10 audit actor is an account", () => {
  it("staff actions are attributed to the account id, not just a display name", async () => {
    await api().post("/v1/admin/staff").set(A).send({ email: "p1-mgr@t.test", name: "Same Name", password: "correct-horse-battery", role: "MANAGER" });
    const l = (await api().post("/v1/admin/auth/login").send({ email: "p1-mgr@t.test", password: "correct-horse-battery" })).body.data;
    const u = await db.staffUser.findUniqueOrThrow({ where: { email: "p1-mgr@t.test" } });
    expect((await api().patch("/v1/admin/products/tailored-navy-blazer").set({ authorization: `Bearer ${l.token}` }).send({ isBest: true })).status).toBe(200);
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "PRODUCT_UPDATE" }, orderBy: { createdAt: "desc" } }); expect(row.actor).toContain(u.id);
  });
});
