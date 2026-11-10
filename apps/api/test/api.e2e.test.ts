import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";
import { OrdersService } from "../src/orders/orders.service";

let app: INestApplication, db: PrismaService, orders: OrdersService;
const A = { "x-admin-key": "test-admin" }, B = { authorization: "Bearer test-billos" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu & Kashmir", postalCode: "180004" };
const contact = { name: "Asha Verma", phone: "9876500001" };
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init();
  db = app.get(PrismaService); orders = app.get(OrdersService);
});
afterAll(async () => { await app.close(); });

/** Variant with controlled stock so tests don't interfere with each other. */
async function variant(sku: string, onHand: number, safety = 0) {
  const v = await db.productVariant.findUniqueOrThrow({ where: { sku } });
  await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand, reserved: 0, safetyStock: safety } });
  return v;
}
const bal = async (sku: string) => (await db.inventoryBalance.findFirstOrThrow({ where: { variant: { sku } } }));
const place = (sku: string, extra: object = {}, qty = 1) => api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: qty }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact, address: addr, ...extra });

describe("catalogue", () => {
  it("lists products with live availability and the standard envelope", async () => {
    const r = await api().get("/v1/products?collection=men&category=Blazers");
    expect(r.status).toBe(200); expect(r.body.success).toBe(true); expect(r.body.meta.requestId).toBeTruthy();
    expect(r.body.data.length).toBe(2); expect(r.body.data[0].variants[0]).toHaveProperty("stockStatus");
  });
  it("returns 404 in the error envelope for unknown product", async () => {
    const r = await api().get("/v1/products/nope"); expect(r.status).toBe(404); expect(r.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
  it("rejects invalid query with a validation error", async () => { expect((await api().get("/v1/products?collection=women")).status).toBe(422); });
});

describe("checkout & stock reservation", () => {
  it("server recalculates totals; COD adds the handling fee; order reserves stock", async () => {
    await variant("JF004-WHI-M", 10);
    const q = await api().post("/v1/checkout/quote").send({ lines: [{ sku: "JF004-WHI-M", quantity: 2 }], fulfilmentType: "COURIER", paymentMethod: "COD", pincode: "110001" });
    expect(q.body.data).toMatchObject({ subtotalPaise: 159800, shippingPaise: 9900, codFeePaise: 4900, totalPaise: 174600 });
    const r = await place("JF004-WHI-M", {}, 2);
    expect(r.status).toBe(201); expect(r.body.data).toMatchObject({ status: "CONFIRMED", paymentStatus: "COD_PENDING", totals: { totalPaise: 174600 } });
    expect(await bal("JF004-WHI-M")).toMatchObject({ onHand: 10, reserved: 2 });
  });
  it("ignores client-supplied prices", async () => {
    await variant("JF004-WHI-L", 5);
    const r = await place("JF004-WHI-L", { totalPaise: 1, lines: [{ sku: "JF004-WHI-L", quantity: 1, unitPricePaise: 1 }] });
    expect(r.body.data.totals.subtotalPaise).toBe(79900);
  });
  it("is idempotent on the idempotency key", async () => {
    await variant("JF004-BLA-M", 5); const key = randomUUID();
    const [a, b] = await Promise.all([place("JF004-BLA-M", { idempotencyKey: key }), place("JF004-BLA-M", { idempotencyKey: key })]);
    expect(a.body.data.number).toBe(b.body.data.number);
    expect((await bal("JF004-BLA-M")).reserved).toBe(1);
  });
  it("never oversells the last unit under concurrent buyers", async () => {
    await variant("JF004-OLI-M", 1);
    const rs = await Promise.all(Array.from({ length: 10 }, () => place("JF004-OLI-M")));
    const ok = rs.filter((r) => r.status === 201), no = rs.filter((r) => r.status === 409);
    expect(ok.length).toBe(1); expect(no.length).toBe(9); expect(no[0]!.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await bal("JF004-OLI-M")).toMatchObject({ onHand: 1, reserved: 1 });
  });
  it("multi-line orders are all-or-nothing", async () => {
    await variant("JF005-BLU-S", 5); await variant("JF005-BLU-M", 0);
    const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku: "JF005-BLU-S", quantity: 1 }, { sku: "JF005-BLU-M", quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact, address: addr });
    expect(r.status).toBe(409); expect((await bal("JF005-BLU-S")).reserved).toBe(0);
  });
  it("safety stock is not sellable online", async () => {
    await variant("JF005-BLU-L", 3, 2);
    expect((await place("JF005-BLU-L", {}, 2)).status).toBe(409);
    expect((await place("JF005-BLU-L", {}, 1)).status).toBe(201);
  });
  it("rejects unknown SKU, COD above limit and missing address", async () => {
    expect((await place("NOPE")).body.error.code).toBe("INVALID_SKU");
    await variant("JF002-STE-M", 5);
    expect((await place("JF002-STE-M", {}, 3)).body.error.code).toBe("COD_ORDER_VALUE_TOO_HIGH");
    const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku: "JF002-STE-M", quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "UPI", idempotencyKey: randomUUID(), contact });
    expect(r.body.error.code).toBe("ADDRESS_REQUIRED");
  });
});

describe("payments", () => {
  it("confirms only via signed webhook, idempotently, and rejects bad signatures", async () => {
    await variant("JF006-LIG-30", 5);
    const o = (await place("JF006-LIG-30", { paymentMethod: "UPI" })).body.data;
    expect(o.status).toBe("PENDING_PAYMENT");
    const s = (await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone })).body.data;
    const body = JSON.stringify({ eventId: "evt_test_1", type: "payment.captured", paymentRef: s.paymentRef, amountPaise: s.amountPaise });
    expect((await api().post("/v1/webhooks/payments/mock").set("x-signature", "bad").set("content-type", "application/json").send(body)).status).toBe(401);
    expect((await api().get(`/v1/orders/${o.number}?phone=${contact.phone}`)).body.data.status).toBe("PENDING_PAYMENT");
    const sig = createHmac("sha256", "test-webhook").update(body).digest("hex");
    const hook = () => api().post("/v1/webhooks/payments/mock").set("x-signature", sig).set("content-type", "application/json").send(body);
    expect((await hook()).body.data.status).toBe("CONFIRMED");
    expect((await hook()).body.data.status).toBe("DUPLICATE");
    expect((await api().get(`/v1/orders/${o.number}?phone=${contact.phone}`)).body.data).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  });
  it("rejects a webhook whose amount does not match the payment", async () => {
    await variant("JF006-LIG-32", 5);
    const o = (await place("JF006-LIG-32", { paymentMethod: "UPI" })).body.data;
    const s = (await api().post("/v1/payments/session").send({ orderNumber: o.number, phone: contact.phone })).body.data;
    const body = JSON.stringify({ eventId: "evt_test_amt", type: "payment.captured", paymentRef: s.paymentRef, amountPaise: 100 });
    const r = await api().post("/v1/webhooks/payments/mock").set("x-signature", createHmac("sha256", "test-webhook").update(body).digest("hex")).set("content-type", "application/json").send(body);
    expect(r.body.data.status).toBe("AMOUNT_MISMATCH");
    expect((await api().get(`/v1/orders/${o.number}?phone=${contact.phone}`)).body.data.status).toBe("PENDING_PAYMENT");
  });
  it("expires unpaid orders and releases their reservation", async () => {
    await variant("JF006-LIG-34", 2);
    const o = (await place("JF006-LIG-34", { paymentMethod: "UPI" })).body.data;
    expect((await bal("JF006-LIG-34")).reserved).toBe(1);
    await db.order.update({ where: { number: o.number }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await orders.expireStale()).toBeGreaterThanOrEqual(1);
    expect((await bal("JF006-LIG-34")).reserved).toBe(0);
    expect((await api().get(`/v1/orders/${o.number}?phone=${contact.phone}`)).body.data.status).toBe("CANCELLED");
  });
});

describe("fulfilment", () => {
  it("dispatch deducts stock; transitions are enforced; admin key required", async () => {
    await variant("JF007-TER-M", 10);
    const o = (await place("JF007-TER-M", {}, 2)).body.data;
    expect((await api().post(`/v1/admin/orders/${o.number}/transition`).send({ to: "PICKING" })).status).toBe(403);
    expect((await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "DELIVERED" })).status).toBe(409);
    for (const to of ["PICKING", "PACKED"]) expect((await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to })).status).toBe(200);
    expect(await bal("JF007-TER-M")).toMatchObject({ onHand: 10, reserved: 2 });
    await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "DISPATCHED" });
    expect(await bal("JF007-TER-M")).toMatchObject({ onHand: 8, reserved: 0 });
    const d = await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "DELIVERED" });
    expect(d.body.data).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID" });
  });
  it("pickup requires the pickup code", async () => {
    await variant("JF007-TER-L", 4);
    const o = (await api().post("/v1/checkout/orders").send({ lines: [{ sku: "JF007-TER-L", quantity: 1 }], fulfilmentType: "PICKUP", paymentMethod: "COD", idempotencyKey: randomUUID(), contact })).body.data;
    expect(o.pickupCode).toMatch(/^\d{6}$/);
    await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "READY_FOR_PICKUP" });
    expect((await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "COLLECTED", pickupCode: "000000" })).status).toBe(422);
    expect((await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "COLLECTED", pickupCode: o.pickupCode })).body.data.status).toBe("COLLECTED");
    expect(await bal("JF007-TER-L")).toMatchObject({ onHand: 3, reserved: 0 });
  });
  it("cancel releases stock; not allowed after dispatch; strangers cannot see orders", async () => {
    await variant("JF007-SAG-M", 3);
    const o = (await place("JF007-SAG-M")).body.data;
    expect((await api().get(`/v1/orders/${o.number}?phone=9000000000`)).status).toBe(404);
    expect((await api().post(`/v1/orders/${o.number}/cancel`).send({ phone: contact.phone })).body.data.status).toBe("CANCELLED");
    expect((await bal("JF007-SAG-M")).reserved).toBe(0);
    await variant("JF007-SAG-L", 3);
    const p = (await place("JF007-SAG-L")).body.data;
    for (const to of ["PICKING", "PACKED", "DISPATCHED"]) await api().post(`/v1/admin/orders/${p.number}/transition`).set(A).send({ to });
    expect((await api().post(`/v1/orders/${p.number}/cancel`).send({ phone: contact.phone })).body.error.code).toBe("NOT_CANCELLABLE");
  });
});

describe("Bill OS integration", () => {
  const ev = (type: string, sku: string, quantity: number, id = randomUUID()) => ({ event_id: id, event_type: type, source_system: "BILL_OS", source_transaction_id: `T-${id.slice(0, 6)}`, location_id: "JAFSON_JAMMU_SHOWROOM", occurred_at: "2026-11-10T10:00:00Z", schema_version: 1, event_payload: { lines: [{ sku, quantity }] } });
  const send = (events: unknown[]) => api().post("/v1/integrations/bill-os/events").set(B).send({ events });

  it("requires integration credentials", async () => { expect((await api().post("/v1/integrations/bill-os/events").send({ events: [{}] })).status).toBe(401); });
  it("matches the spec worked example: 10, reserve 2, showroom sells 3, dispatch", async () => {
    await variant("JF008-OAT-M", 10);
    const o = (await place("JF008-OAT-M", {}, 2)).body.data;
    expect((await send([ev("SALE_COMPLETED", "JF008-OAT-M", 3)])).body.data.results[0].status).toBe("APPLIED");
    expect(await bal("JF008-OAT-M")).toMatchObject({ onHand: 7, reserved: 2 });
    for (const to of ["PICKING", "PACKED", "DISPATCHED"]) await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to });
    expect(await bal("JF008-OAT-M")).toMatchObject({ onHand: 5, reserved: 0 });
  });
  it("duplicate and replayed events never deduct twice", async () => {
    await variant("JF008-OAT-L", 10); const e = ev("SALE_COMPLETED", "JF008-OAT-L", 3);
    const rs = await Promise.all([send([e]), send([e]), send([e])]);
    expect(rs.map((r) => r.body.data.results[0].status).sort()).toEqual(["APPLIED", "DUPLICATE", "DUPLICATE"]);
    expect((await bal("JF008-OAT-L")).onHand).toBe(7);
    expect(await db.inventoryMovement.count({ where: { variant: { sku: "JF008-OAT-L" }, sourceSystem: "BILL_OS" } })).toBe(1);
  });
  it("quarantines unknown SKUs and sales that would break a reservation, never silently dropping", async () => {
    const u = await send([ev("SALE_COMPLETED", "GHOST-SKU", 1)]); expect(u.body.data.results[0]).toMatchObject({ status: "QUARANTINED", reason: "UNKNOWN_SKU" });
    await variant("JF008-RUS-M", 2); await place("JF008-RUS-M", {}, 2);
    const c = await send([ev("SALE_COMPLETED", "JF008-RUS-M", 1)]); expect(c.body.data.results[0]).toMatchObject({ status: "QUARANTINED", reason: "STOCK_CONFLICT" });
    expect(await bal("JF008-RUS-M")).toMatchObject({ onHand: 2, reserved: 2 });
    const st = (await api().get("/v1/integrations/bill-os/events/status").set(B)).body.data;
    expect(st.counts.QUARANTINED).toBeGreaterThanOrEqual(2);
    expect((await send([{ event_id: randomUUID(), event_type: "NOPE" }])).body.data.results[0].status).toBe("QUARANTINED");
  });
  it("applies receipts and returns, and a failed batch item does not block the others", async () => {
    await variant("JF008-RUS-L", 1);
    const r = (await send([ev("STOCK_RECEIVED", "JF008-RUS-L", 5), ev("SALE_COMPLETED", "GHOST-2", 1), ev("SALE_RETURNED", "JF008-RUS-L", 1)])).body.data.results;
    expect(r.map((x: any) => x.status)).toEqual(["APPLIED", "QUARANTINED", "APPLIED"]);
    expect((await bal("JF008-RUS-L")).onHand).toBe(7);
  });
  it("snapshot reconciliation reports discrepancies", async () => {
    await variant("JF009-WHI-M", 6);
    const r = (await api().post("/v1/integrations/bill-os/snapshots").set(B).send({ location_id: "JAFSON_JAMMU_SHOWROOM", lines: [{ sku: "JF009-WHI-M", quantity: 5 }, { sku: "NOPE", quantity: 1 }] })).body.data;
    expect(r.discrepancies).toEqual([{ sku: "JF009-WHI-M", ledger: 6, reported: 5, known: true }, { sku: "NOPE", ledger: 0, reported: 1, known: false }]);
  });
});

describe("accounts, returns and ledger integrity", () => {
  it("OTP sign-in, wrong code, throttling, and own-order access", async () => {
    const phone = "9811100001";
    const req = await api().post("/v1/auth/otp/request").send({ phone }); const code = req.body.data.devCode;
    expect((await api().post("/v1/auth/otp/verify").send({ phone, code: code === "000000" ? "111111" : "000000" })).status).toBe(400);
    const ok = await api().post("/v1/auth/otp/verify").send({ phone, code }); expect(ok.status).toBe(200);
    const tok = ok.body.data.accessToken; expect((await api().get("/v1/auth/me").set("authorization", `Bearer ${tok}`)).body.data.phone).toBe(phone);
    expect((await api().post("/v1/auth/otp/verify").send({ phone, code })).status).toBe(400); // single use
    await variant("JF009-WHI-L", 3);
    const o = await place("JF009-WHI-L", {}).set("authorization", `Bearer ${tok}`);
    expect((await api().get("/v1/orders").set("authorization", `Bearer ${tok}`)).body.data.map((x: any) => x.number)).toContain(o.body.data.number);
    const rf = await api().post("/v1/auth/refresh").send({ refreshToken: ok.body.data.refreshToken }); expect(rf.status).toBe(200);
    expect((await api().post("/v1/auth/refresh").send({ refreshToken: ok.body.data.refreshToken })).status).toBe(401); // rotated
    const p2 = "9811100002"; for (let i = 0; i < 5; i++) await api().post("/v1/auth/otp/request").send({ phone: p2 });
    expect((await api().post("/v1/auth/otp/request").send({ phone: p2 })).status).toBe(429);
  });
  it("returns: only after delivery, within the window, per item", async () => {
    await variant("JF009-WHI-XL", 5);
    const o = (await place("JF009-WHI-XL")).body.data; const item = o.items[0].id;
    const body = { orderNumber: o.number, phone: contact.phone, items: [{ orderItemId: item, kind: "RETURN", reason: "Size too large" }] };
    expect((await api().post("/v1/returns").send(body)).body.error.code).toBe("NOT_ELIGIBLE");
    for (const to of ["PICKING", "PACKED", "DISPATCHED", "DELIVERED"]) await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to });
    const ok = await api().post("/v1/returns").send(body); expect(ok.status).toBe(201); expect(ok.body.data.ref).toMatch(/^RT/);
    expect((await api().post("/v1/returns").send(body)).body.error.code).toBe("ALREADY_REQUESTED");
    await db.order.update({ where: { number: o.number }, data: { deliveredAt: new Date(Date.now() - 9 * 86400_000) } });
    await db.returnRequest.updateMany({ data: { status: "REJECTED" } });
    expect((await api().post("/v1/returns").send(body)).body.error.code).toBe("RETURN_WINDOW_CLOSED");
  });
  it("inventory movements are append-only at the database level", async () => {
    const m = await db.inventoryMovement.findFirstOrThrow();
    await expect(db.inventoryMovement.update({ where: { id: m.id }, data: { quantityDelta: 999 } })).rejects.toThrow(/append-only/);
    await expect(db.inventoryMovement.delete({ where: { id: m.id } })).rejects.toThrow(/append-only/);
  });
  it("the database refuses negative or over-reserved balances", async () => {
    const v = await variant("JF009-WHI-S", 2);
    await expect(db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { reserved: 3 } })).rejects.toThrow();
    await expect(db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: -1 } })).rejects.toThrow();
  });
  it("admin stock adjustment cannot go below reserved and is audited", async () => {
    await variant("JF009-SKY-M", 5); await place("JF009-SKY-M", {}, 2);
    expect((await api().post("/v1/admin/inventory/adjustments").set(A).send({ sku: "JF009-SKY-M", newOnHand: 1, reason: "recount" })).body.error.code).toBe("BELOW_RESERVED");
    expect((await api().post("/v1/admin/inventory/adjustments").set(A).send({ sku: "JF009-SKY-M", newOnHand: 9, reason: "recount" })).body.data.onHand).toBe(9);
    expect(await db.auditLog.count({ where: { action: "INVENTORY_ADJUST", entityId: "JF009-SKY-M" } })).toBe(1);
  });
});
