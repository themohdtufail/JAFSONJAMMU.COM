import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";
import { gstinCheckChar } from "../src/gst/gst";

let app: INestApplication, db: PrismaService; const A = { "x-admin-key": "test-admin" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };
const api = () => request(app.getHttpServer());
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); });
let pn = 10; const phone = () => `98765${String(pn++).padStart(5, "0")}`;
const stock = async (sku: string, n = 30) => { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0, safetyStock: 0 } }); };
const mk = (o: object) => api().post("/v1/admin/coupons").set(A).send({ description: "Test coupon", kind: "PERCENT", value: 1000, ...o });
const order = (sku: string, coupon: string | undefined, ph = phone(), extra: object = {}) => api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: ph }, address: addr, coupon, ...extra });
const quote = (sku: string, coupon?: string) => api().post("/v1/checkout/quote").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "UPI", pincode: "180004", coupon });

describe("promotions", () => {
  it("a manager creates a coupon; staff cannot; bad definitions are rejected", async () => {
    expect((await mk({ code: "SAVE10", minSubtotalPaise: 100000 })).status).toBe(200);
    expect((await mk({ code: "SAVE10" })).body.error.code).toBe("CODE_TAKEN");
    expect((await mk({ code: "BIG", value: 9500 })).status).toBe(422); expect((await mk({ code: "FL", kind: "FLAT", value: 50 })).status).toBe(422); expect((await mk({ code: "x!" })).status).toBe(422);
    await api().post("/v1/admin/staff").set(A).send({ email: "promo-staff@t.test", name: "Promo Staff", password: "correct-horse-battery", role: "STAFF" });
    const t = (await api().post("/v1/admin/auth/login").send({ email: "promo-staff@t.test", password: "correct-horse-battery" })).body.data.token;
    expect((await api().post("/v1/admin/coupons").set({ authorization: `Bearer ${t}` }).send({ code: "NOPE", description: "x y z", kind: "PERCENT", value: 500 })).status).toBe(403);
  });

  it("the quote shows the discount, or says plainly why a code does not apply", async () => {
    const sku = "JF001-NAV-M"; const base = (await quote(sku)).body.data;
    const q = (await quote(sku, " save10 ")).body.data; expect(q.couponProblem).toBeNull(); expect(q.coupon.code).toBe("SAVE10"); expect(q.discountPaise).toBe(Math.floor(base.subtotalPaise / 10)); expect(q.totalPaise).toBe(base.totalPaise - q.discountPaise);
    expect((await quote(sku, "WRONG")).body.data.couponProblem.code).toBe("COUPON_INVALID");
    await mk({ code: "BIGMIN", minSubtotalPaise: 90_000_000 }); const c = (await quote(sku, "BIGMIN")).body.data; expect(c.couponProblem.code).toBe("COUPON_MIN_NOT_MET"); expect(c.discountPaise).toBe(0);
  });

  it("an order with a coupon stores the discount per line, its tax follows what was paid, and the invoice adds up", async () => {
    const sku = "JF001-NAV-M"; await stock(sku); const ph = phone();
    const o = (await order(sku, "SAVE10", ph)).body.data; const gross = o.items[0].unitPricePaise;
    expect(o.totals.couponCode).toBe("SAVE10"); expect(o.totals.discountPaise).toBe(Math.floor(gross / 10)); expect(o.items[0].lineTotalPaise).toBe(gross - o.totals.discountPaise); expect(o.totals.subtotalPaise).toBe(o.items[0].lineTotalPaise);
    expect(o.totals.totalPaise).toBe(o.totals.subtotalPaise + o.totals.shippingPaise + o.totals.codFeePaise);
    // tax invoice in tax mode
    const base = "01ABCDE1234F1Z", G = base + gstinCheckChar(base); const saved = { g: process.env.SELLER_GSTIN, a: process.env.SELLER_ADDRESS }; process.env.SELLER_GSTIN = G; process.env.SELLER_ADDRESS = "Industrial Estate, Jammu";
    try {
      await api().patch("/v1/admin/products/tailored-navy-blazer").set(A).send({ hsnCode: "6203" });
      for (const to of ["PICKING", "PACKED", "DISPATCHED"]) { const tr = await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to }); expect(tr.body.error?.code ?? tr.status).toBe(200); }
      const inv = (await api().get(`/v1/orders/${o.number}/documents?phone=${ph}`)).body.data.invoice;
      expect(inv.totalPaise).toBe(o.totals.totalPaise); expect(inv.taxablePaise + inv.cgstPaise + inv.sgstPaise + inv.igstPaise).toBe(inv.totalPaise);
    } finally { saved.g === undefined ? delete process.env.SELLER_GSTIN : (process.env.SELLER_GSTIN = saved.g); saved.a === undefined ? delete process.env.SELLER_ADDRESS : (process.env.SELLER_ADDRESS = saved.a); }
  });

  it("one use per customer: the same phone cannot reuse it, another can; cancelling gives the use back", async () => {
    await mk({ code: "ONCE", value: 500, minSubtotalPaise: 0 }); const sku = "JF001-NAV-L"; await stock(sku); const ph = phone();
    const first = await order(sku, "ONCE", ph); expect(first.status).toBe(201);
    const again = await order(sku, "ONCE", ph); expect(again.status).toBe(422); expect(again.body.error.code).toBe("COUPON_ALREADY_USED");
    expect((await order(sku, "ONCE", phone())).status).toBe(201);
    expect((await api().post(`/v1/admin/orders/${first.body.data.number}/cancel`).set(A)).status).toBe(200);
    expect((await order(sku, "ONCE", ph)).status).toBe(201);
    expect(await db.couponRedemption.count({ where: { coupon: { code: "ONCE" }, releasedAt: { not: null } } })).toBe(1);
  });

  it("a usage limit holds under simultaneous orders", async () => {
    await mk({ code: "LAST3", value: 300, minSubtotalPaise: 0, usageLimit: 3 }); const sku = "JF001-NAV-XL"; await stock(sku);
    const rs = await Promise.all(Array.from({ length: 8 }, () => order(sku, "LAST3")));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(3); expect(rs.filter((r) => r.status === 422 && r.body.error.code === "COUPON_EXHAUSTED")).toHaveLength(3 + 2);
    expect(await db.couponRedemption.count({ where: { coupon: { code: "LAST3" }, releasedAt: null } })).toBe(3);
  });

  it("inactive and expired coupons are refused at checkout, and an unknown code never silently charges full price", async () => {
    await mk({ code: "OLD", minSubtotalPaise: 0, endsAt: new Date(Date.now() + 1000).toISOString(), startsAt: new Date(Date.now() - 86400_000).toISOString() });
    await db.coupon.update({ where: { code: "OLD" }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await order("JF001-NAV-M", "OLD")).body.error.code).toBe("COUPON_EXPIRED");
    await mk({ code: "PAUSED", minSubtotalPaise: 0 }); expect((await api().patch("/v1/admin/coupons/PAUSED").set(A).send({ isActive: false })).status).toBe(200);
    expect((await order("JF001-NAV-M", "PAUSED")).body.error.code).toBe("COUPON_INACTIVE"); expect((await order("JF001-NAV-M", "NOSUCH")).body.error.code).toBe("COUPON_INVALID");
  });
});
