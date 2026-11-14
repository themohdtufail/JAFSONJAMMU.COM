import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

let app: INestApplication, db: PrismaService; const A = { "x-admin-key": "test-admin" }, B = { authorization: "Bearer test-billos" };
const api = () => request(app.getHttpServer());
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); });

async function fresh(sku: string, onHand: number) { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryReservation.updateMany({ where: { variantId: v.id, status: "ACTIVE" }, data: { status: "RELEASED" } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand, reserved: 0, safetyStock: 0 } }); await db.integrationHeartbeat.deleteMany(); return v; }
const buy = (sku: string, qty = 1) => api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: qty }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: `98761${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}` }, address: addr });
const showroomSale = (sku: string, q: number) => api().post("/v1/integrations/bill-os/events").set(B).send({ events: [{ event_id: randomUUID(), event_type: "SALE_COMPLETED", source_system: "BILL_OS", source_transaction_id: randomUUID().slice(0, 8), location_id: "JAFSON_JAMMU_SHOWROOM", occurred_at: new Date().toISOString(), schema_version: 1, event_payload: { lines: [{ sku, quantity: q }] } }] });

describe("overselling under pressure (spec 11.4)", () => {
  it("40 online buyers of 6 units: exactly 6 succeed, the rest are told it is unavailable, and the ledger balances", async () => {
    const v = await fresh("JF003-NAV-M", 6).catch(async () => fresh("JF002-STE-L", 6)); const sku = v.sku;
    const rs = await Promise.all(Array.from({ length: 40 }, () => buy(sku)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(6); expect(rs.filter((r) => r.status === 409 && r.body.error.code === "INSUFFICIENT_STOCK")).toHaveLength(34);
    const b = await db.inventoryBalance.findFirstOrThrow({ where: { variantId: v.id } }); expect([b.onHand, b.reserved]).toEqual([6, 6]);
    expect(await db.inventoryReservation.aggregate({ where: { variantId: v.id, status: "ACTIVE" }, _sum: { quantity: true } }).then((x) => x._sum.quantity)).toBe(6);
  });

  it("online buyers and showroom sales racing for the same 10 units never take more than exist", async () => {
    const v = await fresh("JF002-STE-XL", 10); const sku = v.sku;
    const jobs = [...Array.from({ length: 14 }, () => ({ kind: "online" as const, p: buy(sku) })), ...Array.from({ length: 8 }, () => ({ kind: "showroom" as const, p: showroomSale(sku, 1) }))];
    const rs = await Promise.all(jobs.map((j) => j.p)); const online = jobs.map((j, i) => ({ ...j, r: rs[i]! })).filter((j) => j.kind === "online" && j.r.status === 201).length;
    const showroom = jobs.map((j, i) => ({ ...j, r: rs[i]! })).filter((j) => j.kind === "showroom" && j.r.body.data.results[0].status === "APPLIED").length;
    const b = await db.inventoryBalance.findFirstOrThrow({ where: { variantId: v.id } });
    expect(b.onHand).toBe(10 - showroom); expect(b.reserved).toBe(online); expect(b.onHand).toBeGreaterThanOrEqual(b.reserved); expect(online + showroom).toBeLessThanOrEqual(10);
    // anything the showroom could not take was quarantined for a person, never dropped
    const lost = 8 - showroom; expect(await db.integrationEventInbox.count({ where: { status: "QUARANTINED", quarantineReason: "STOCK_CONFLICT", receivedAt: { gte: new Date(Date.now() - 60_000) } } })).toBeGreaterThanOrEqual(lost > 0 ? 1 : 0);
  });

  it("dispatching while buyers keep ordering keeps reserved and on-hand consistent", async () => {
    const v = await fresh("JF002-STE-S", 5); const sku = v.sku; const mine = [] as string[];
    for (let i = 0; i < 3; i++) { const r = await buy(sku); mine.push(r.body.data.number); }
    await Promise.all([...mine.map(async (n) => { for (const to of ["PICKING", "PACKED", "DISPATCHED"]) await api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to }); }), ...Array.from({ length: 6 }, () => buy(sku))]);
    const b = await db.inventoryBalance.findFirstOrThrow({ where: { variantId: v.id } }); const active = (await db.inventoryReservation.aggregate({ where: { variantId: v.id, status: "ACTIVE" }, _sum: { quantity: true } }))._sum.quantity ?? 0;
    expect(b.reserved).toBe(active); expect(b.onHand).toBeGreaterThanOrEqual(b.reserved); expect(b.onHand).toBe(5 - 3); // three left the building
  });
});
