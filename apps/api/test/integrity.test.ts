import "reflect-metadata";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Runs against its own throwaway database (migrations + seed), because other tests deliberately bend balances. */
const ADMIN = "postgresql://jafson:jafson@localhost:5432/postgres", dbName = `integ_${Date.now()}`, url = `postgresql://jafson:jafson@localhost:5432/${dbName}`;
let app: INestApplication, saved: string | undefined; const A = { "x-admin-key": "test-admin" }; const api = () => request(app.getHttpServer());
const sql = (q: string) => execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-Atc", q], { encoding: "utf8" }).trim();
const run = async () => (await api().get("/v1/admin/integrity").set(A)).body.data as { ok: boolean; checks: { name: string; ok: boolean; problems: string[] }[] };
const failing = (r: Awaited<ReturnType<typeof run>>) => r.checks.filter((c) => !c.ok);
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };

beforeAll(async () => {
  execFileSync("psql", [ADMIN, "-qc", `CREATE DATABASE ${dbName}`]); saved = process.env.DATABASE_URL; process.env.DATABASE_URL = url;
  execSync("npx tsx prisma/setup.ts", { env: process.env, stdio: "pipe" }); execSync("npx tsx prisma/seed.ts", { env: process.env, stdio: "pipe" });
  const { AppModule } = await import("../src/app.module"); const { configureApp } = await import("../src/common/http");
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init();
}, 120_000);
afterAll(async () => { await app.close(); process.env.DATABASE_URL = saved; try { execFileSync("psql", [ADMIN, "-qc", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]); } catch { /* best effort */ } });

async function place(method: string, sku = "JF002-STE-M") {
  const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: method, idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: `98762${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}` }, address: addr }); expect(r.status).toBe(201); return r.body.data.number as string;
}
const T = (n: string, to: string) => api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to });

describe("integrity checks", () => {
  it("a database that has taken orders, payments, dispatches and cancellations through the normal flows passes every check", async () => {
    const cod = await place("COD"); for (const to of ["PICKING", "PACKED", "DISPATCHED", "DELIVERED"]) await T(cod, to);
    const upi = await place("UPI"); const sess = (await api().post("/v1/payments/session").send({ orderNumber: upi, phone: sql(`SELECT "contactPhone" FROM "Order" WHERE number='${upi}'`) })).body.data;
    expect((await api().post(`/v1/payments/mock/${sess.paymentRef}/pay`).send({ outcome: "success" })).status).toBe(200);
    const gone = await place("COD"); await api().post(`/v1/admin/orders/${gone}/cancel`).set(A);
    await place("COD"); // left reserved and active
    const r = await run(); expect(failing(r).map((c) => c.name)).toEqual([]); expect(r.ok).toBe(true); expect(r.checks.length).toBeGreaterThanOrEqual(11);
  });

  it("detects reserved stock that no reservation explains, and clears when put right", async () => {
    sql(`UPDATE "InventoryBalance" SET reserved = reserved + 1 WHERE id = (SELECT id FROM "InventoryBalance" WHERE "onHand" > reserved LIMIT 1)`);
    const bad = failing(await run()); expect(bad).toHaveLength(1); expect(bad[0]!.name).toContain("Reserved stock"); expect(bad[0]!.problems[0]).toMatch(/ledger says \d+ reserved, active reservations total \d+/);
    sql(`UPDATE "InventoryBalance" SET reserved = reserved - 1 WHERE reserved > 0 AND id = (SELECT b.id FROM "InventoryBalance" b LEFT JOIN (SELECT "variantId", sum(quantity) q FROM "InventoryReservation" WHERE status='ACTIVE' GROUP BY 1) r ON r."variantId" = b."variantId" WHERE b.reserved <> COALESCE(r.q, 0) LIMIT 1)`);
    expect((await run()).ok).toBe(true);
  });

  it("detects a captured payment that differs from its order, and a refund above what was captured", async () => {
    const pid = sql(`SELECT id FROM "Payment" WHERE status='CAPTURED' LIMIT 1`); const amt = Number(sql(`SELECT "amountPaise" FROM "Payment" WHERE id='${pid}'`));
    sql(`UPDATE "Payment" SET "amountPaise" = ${amt + 100} WHERE id='${pid}'`); let bad = failing(await run()); expect(bad.map((c) => c.name)).toContain("A captured online payment matches its order total, and every paid online order has one"); sql(`UPDATE "Payment" SET "amountPaise" = ${amt} WHERE id='${pid}'`);
    sql(`INSERT INTO "Refund" (id, "orderId", "paymentId", "amountPaise", reason, actor, status, "createdAt", "updatedAt") SELECT gen_random_uuid(), "orderId", id, ${amt + 500}, 'test', 'test', 'PROCESSED', now(), now() FROM "Payment" WHERE id='${pid}'`);
    bad = failing(await run()); expect(bad.map((c) => c.name)).toContain("Refunds never exceed what was captured"); sql(`DELETE FROM "Refund" WHERE reason='test'`); expect((await run()).ok).toBe(true);
  });

  it("flags customer messages that gave up, and an order paid online with no captured payment", async () => {
    sql(`INSERT INTO "Notification" (id, channel, recipient, template, payload, status, attempts, "dedupeKey") VALUES (gen_random_uuid(), 'SMS', '9000000000', 'ORDER_CONFIRMED', '{}', 'FAILED', 6, 'integrity-test')`);
    expect(failing(await run()).map((c) => c.name)).toContain("No customer message is stuck (pending for over an hour or failed)"); sql(`DELETE FROM "Notification" WHERE "dedupeKey"='integrity-test'`);
    const n = await place("UPI"); sql(`UPDATE "Order" SET "paymentStatus"='PAID' WHERE number='${n}'`);
    expect(failing(await run()).flatMap((c) => c.problems).some((p) => p.includes(n) && p.includes("no captured payment"))).toBe(true); sql(`UPDATE "Order" SET "paymentStatus"='PENDING' WHERE number='${n}'`); expect((await run()).ok).toBe(true);
  });

  it("is manager-only, and the command-line check exits 0 when clean and 1 when something is wrong", async () => {
    await api().post("/v1/admin/staff").set(A).send({ email: "int-staff@t.test", name: "Int Staff", password: "correct-horse-battery", role: "STAFF" });
    const t = (await api().post("/v1/admin/auth/login").send({ email: "int-staff@t.test", password: "correct-horse-battery" })).body.data.token; expect((await api().get("/v1/admin/integrity").set({ authorization: `Bearer ${t}` })).status).toBe(403);
    const cli = () => spawnSync("npx", ["tsx", "prisma/integrity.ts"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
    expect(cli().status).toBe(0); sql(`UPDATE "InventoryBalance" SET reserved = reserved + 1 WHERE id = (SELECT id FROM "InventoryBalance" WHERE "onHand" > reserved LIMIT 1)`);
    const bad = cli(); expect(bad.status).toBe(1); expect(bad.stdout).toContain("✗ Reserved stock");
  });
});
