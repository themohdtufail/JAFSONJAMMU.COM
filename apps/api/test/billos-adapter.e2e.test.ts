import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";
import { createClient, flush, Outbox, backoffMs } from "../../../integrations/bill-os-adapter/src";

/** Spec 4.6 acceptance, exercised end to end: the reference adapter (local outbox + HTTP only) against the real API and database. */
let app: INestApplication, db: PrismaService, base = "";
const A = { "x-admin-key": "test-admin" }, KEY = "test-billos";
const LOC = "JAFSON_JAMMU_SHOWROOM";
const client = (baseUrl = base) => createClient({ baseUrl, apiKey: KEY, timeoutMs: 3000 });
const ev = (type: string, payload: object, extra: object = {}) => ({ event_id: randomUUID(), event_type: type, source_system: "BILL_OS", source_transaction_id: `T-${randomUUID().slice(0, 6)}`, location_id: LOC, occurred_at: new Date().toISOString(), schema_version: 1, event_payload: payload, ...extra });
const sale = (sku: string, q: number) => ev("SALE_COMPLETED", { lines: [{ sku, quantity: q }] });
const onHand = async (sku: string, loc = LOC) => (await db.inventoryBalance.findFirstOrThrow({ where: { variant: { sku }, location: { code: loc } } })).onHand;
async function setStock(sku: string, n: number) { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0, safetyStock: 0 } }); await db.integrationHeartbeat.deleteMany(); }
const closedPort = () => new Promise<number>((res) => { const s = createServer().listen(0, () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });

beforeAll(async () => {
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`; db = app.get(PrismaService);
});
afterAll(async () => { await app.close(); });

describe("Bill OS integration acceptance (spec 4.6)", () => {
  it("Bill OS can emit a sale event, and the ledger moves once", async () => {
    await setStock("JF010-TAN-M", 10); const ob = new Outbox(); const e = sale("JF010-TAN-M", 3); ob.enqueue(e);
    const rep = await flush(ob, client().sendEvents); expect(rep).toMatchObject({ sent: 1, synced: 1 }); expect(await onHand("JF010-TAN-M")).toBe(7); expect(ob.stats()).toMatchObject({ pending: 0, synced: 1 });
  });

  it("duplicate events do not deduct stock twice (outbox and server both de-duplicate)", async () => {
    await setStock("JF010-TAN-L", 10); const ob = new Outbox(); const e = sale("JF010-TAN-L", 2);
    expect(ob.enqueue(e).stored).toBe(true); expect(ob.enqueue(e).stored).toBe(false); // POS retried its own call
    await flush(ob, client().sendEvents);
    const again = await client().sendEvents([e]); expect(again.results[0]!.status).toBe("DUPLICATE"); // replayed straight to the server
    expect(await onHand("JF010-TAN-L")).toBe(8);
  });

  it("offline sales are kept, retried with backoff under the same event id, and synchronise after reconnecting", async () => {
    await setStock("JF010-TAN-S", 10); const ob = new Outbox(); const e = sale("JF010-TAN-S", 4); ob.enqueue(e);
    const dead = client(`http://127.0.0.1:${await closedPort()}`); let now = 1_000_000;
    const r1 = await flush(ob, dead.sendEvents, { now }); expect(r1.retried).toBe(1); expect(r1.error).toBeTruthy();
    expect(await onHand("JF010-TAN-S")).toBe(10); expect(ob.stats()).toMatchObject({ pending: 1 }); // visible, not lost
    expect(await flush(ob, client().sendEvents, { now: now + 1 })).toMatchObject({ sent: 0 }); // not due yet: backoff holds it
    const row = ob.list("PENDING")[0]!; expect(row.attempts).toBe(1); expect(row.nextAttemptAt).toBeGreaterThan(now);
    const r2 = await flush(ob, client().sendEvents, { now: row.nextAttemptAt + 1 }); expect(r2.synced).toBe(1);
    expect(await onHand("JF010-TAN-S")).toBe(6); expect(ob.stats()).toMatchObject({ pending: 0, synced: 1 }); expect(JSON.parse(ob.list("SYNCED")[0]!.payload).event_id).toBe(e.event_id);
  });

  it("a response lost on the way back does not cause a second deduction", async () => {
    await setStock("JF011-NAV-4-5Y", 10); const ob = new Outbox(); const e = sale("JF011-NAV-4-5Y", 1); ob.enqueue(e);
    const lossy = async (events: unknown[]) => { await client().sendEvents(events); throw new Error("connection reset"); }; // server applied it, the reply never arrived
    const r1 = await flush(ob, lossy, { now: 5 }); expect(r1.retried).toBe(1); expect(await onHand("JF011-NAV-4-5Y")).toBe(9);
    const r2 = await flush(ob, client().sendEvents, { now: ob.list("PENDING")[0]!.nextAttemptAt + 1 }); expect(r2.synced).toBe(1); expect(await onHand("JF011-NAV-4-5Y")).toBe(9);
  });

  it("backoff doubles up to a cap", () => {
    const f = (n: number) => backoffMs(n, { jitter: 0, base: 1000, max: 8000 }); expect([1, 2, 3, 4, 5, 9].map(f)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("failed synchronisation is visible to staff: unknown SKUs are quarantined, shown on both sides, and no stock moves", async () => {
    const ob = new Outbox(); const e = sale("NO-SUCH-SKU", 1); ob.enqueue(e);
    const rep = await flush(ob, client().sendEvents); expect(rep.rejected).toBe(1);
    expect(ob.list("REJECTED")[0]!.lastError).toContain("UNKNOWN_SKU"); expect(ob.stats().rejected).toBe(1);
    const st = (await request(base).get("/v1/integrations/bill-os/events/status").set("authorization", `Bearer ${KEY}`)).body.data; expect(st.quarantined.some((q: any) => q.eventId === e.event_id && q.quarantineReason === "UNKNOWN_SKU")).toBe(true);
    ob.requeue(e.event_id); expect(ob.stats()).toMatchObject({ pending: 1, rejected: 0 });
    expect((await request(base).get("/v1/integrations/bill-os/events/status")).status).toBe(401); // credentials required
  });

  it("stock reconciliation identifies discrepancies, reports them, and never overwrites the ledger", async () => {
    await setStock("JF011-NAV-6-7Y", 10); const snap = ev("STOCK_SNAPSHOT_SUBMITTED", { lines: [{ sku: "JF011-NAV-6-7Y", quantity: 7 }, { sku: "GHOST-SKU", quantity: 2 }, { sku: "JF010-TAN-M", quantity: await onHand("JF010-TAN-M") }] });
    const ob = new Outbox(); ob.enqueue(snap); expect((await flush(ob, client().sendEvents)).synced).toBe(1);
    expect(await onHand("JF011-NAV-6-7Y")).toBe(10); // ledger untouched
    const rows = (await request(base).get("/v1/admin/integrations/reconciliations").set(A)).body.data; const r = rows.find((x: any) => x.eventId === snap.event_id);
    expect(r.checked).toBe(3); expect(r.discrepancyCount).toBe(2); expect(r.discrepancies).toEqual(expect.arrayContaining([{ sku: "JF011-NAV-6-7Y", ledger: 10, reported: 7, known: true }, { sku: "GHOST-SKU", ledger: 0, reported: 2, known: false }]));
  });

  it("transfers move stock between locations atomically, and an impossible one is quarantined", async () => {
    await db.inventoryLocation.upsert({ where: { code: "WAREHOUSE" }, update: {}, create: { code: "WAREHOUSE", name: "Warehouse" } }); await setStock("JF012-OLI-4-5Y", 6);
    const ob = new Outbox(); ob.enqueue(ev("STOCK_TRANSFERRED", { to_location_id: "WAREHOUSE", lines: [{ sku: "JF012-OLI-4-5Y", quantity: 4 }] }));
    expect((await flush(ob, client().sendEvents)).synced).toBe(1); expect(await onHand("JF012-OLI-4-5Y")).toBe(2); expect(await onHand("JF012-OLI-4-5Y", "WAREHOUSE")).toBe(4);
    ob.enqueue(ev("STOCK_TRANSFERRED", { to_location_id: "WAREHOUSE", lines: [{ sku: "JF012-OLI-4-5Y", quantity: 99 }] })); const bad = await flush(ob, client().sendEvents); expect(bad.rejected).toBe(1);
    expect(await onHand("JF012-OLI-4-5Y")).toBe(2); expect(await onHand("JF012-OLI-4-5Y", "WAREHOUSE")).toBe(4);
    ob.enqueue(ev("STOCK_TRANSFERRED", { to_location_id: "NOWHERE", lines: [{ sku: "JF012-OLI-4-5Y", quantity: 1 }] })); expect((await flush(ob, client().sendEvents)).rejected).toBe(1);
  });

  it("while the POS is silent, online availability is held back; hearing from it again lifts the hold (spec 4.5)", async () => {
    const sku = "JF009-WHI-M"; await setStock(sku, 3);
    const avail = async () => (await request(base).get("/v1/products/" + (await db.productVariant.findUniqueOrThrow({ where: { sku }, include: { product: true } })).product.slug)).body.data.variants.find((v: any) => v.sku === sku);
    expect((await client().heartbeat()).ok).toBe(true); expect((await avail()).stockStatus).toBeTruthy();
    const before = await db.inventoryBalance.findFirstOrThrow({ where: { variant: { sku } } });
    await db.integrationHeartbeat.update({ where: { source: "BILL_OS" }, data: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } }); // POS silent for 3 hours
    const st = (await request(base).get("/v1/integrations/bill-os/events/status").set("authorization", `Bearer ${KEY}`)).body.data; expect(st.posSilent).toBe(true); expect(st.extraBuffer).toBe(1);
    await db.inventoryBalance.updateMany({ where: { id: before.id }, data: { onHand: 1 } }); // one unit left: the hold withholds it from online buyers
    const o = await request(base).post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: "9876599901" }, address: { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" } });
    expect(o.status).toBe(409); expect(o.body.error.code).toBe("INSUFFICIENT_STOCK");
    await client().heartbeat(); // the POS is back
    const ok = await request(base).post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: "9876599901" }, address: { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" } });
    expect(ok.status).toBe(201);
  });

  it("no direct database coupling: the adapter depends on HTTP and its own SQLite file only", () => {
    const pkg = JSON.parse(readFileSync("../../integrations/bill-os-adapter/package.json", "utf8")); expect(Object.keys(pkg.dependencies)).toEqual(["@jafson/validation"]);
    for (const f of ["outbox", "client", "flush"]) { const src = readFileSync(`../../integrations/bill-os-adapter/src/${f}.ts`, "utf8"); expect(src).not.toMatch(/prisma|from "pg"|postgres/i); }
  });
});
