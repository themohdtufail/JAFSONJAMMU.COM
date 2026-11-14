import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

let app: INestApplication, db: PrismaService; const A = { "x-admin-key": "test-admin" };
const addr = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu and Kashmir", postalCode: "180004" };
const api = () => request(app.getHttpServer());
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); });
let pn = 40; const phone = () => `98764${String(pn++).padStart(5, "0")}`;
const stock = async (sku: string, n = 30) => { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0, safetyStock: 0 } }); };
async function order(fulfilmentType = "COURIER", sku = "JF002-STE-M") { await stock(sku); const ph = phone(); const r = await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType, paymentMethod: "COD", idempotencyKey: randomUUID(), contact: { name: "Asha Verma", phone: ph }, address: fulfilmentType === "PICKUP" ? undefined : addr }); expect(r.status).toBe(201); return { n: r.body.data.number as string, ph }; }
const T = (n: string, to: string) => api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to });
const ship = (n: string, b: object, h: Record<string, string> = A) => api().post(`/v1/admin/orders/${n}/shipment`).set(h).send(b);
async function signIn() { const ph = phone(); const code = (await api().post("/v1/auth/otp/request").send({ phone: ph })).body.data.devCode; const t = (await api().post("/v1/auth/otp/verify").send({ phone: ph, code })).body.data.accessToken; return { H: { authorization: `Bearer ${t}` }, ph }; }
const anAwb = () => `AWB${Math.floor(Math.random() * 1e9)}`;

describe("shipments", () => {
  it("courier details are accepted only once the order is packed, and never for showroom pickup", async () => {
    const o = await order(); expect((await ship(o.n, { carrier: "Delhivery", awb: anAwb() })).body.error.code).toBe("NOT_SHIPPABLE");
    const p = await order("PICKUP"); await T(p.n, "READY_FOR_PICKUP"); expect((await ship(p.n, { carrier: "Delhivery", awb: anAwb() })).body.error.code).toBe("NOT_SHIPPABLE");
  });
  it("staff add a shipment with a tracking link; the customer sees it and its history, without staff names", async () => {
    const o = await order(); await T(o.n, "PICKING"); await T(o.n, "PACKED"); const awb = anAwb();
    const r = await ship(o.n, { carrier: "Delhivery", awb, trackingUrl: "https://example.com/track?id=" + awb }); expect(r.status).toBe(200); expect(r.body.data.shipment).toMatchObject({ carrier: "Delhivery", awb, status: "BOOKED" });
    await T(o.n, "DISPATCHED");
    expect((await api().post(`/v1/admin/orders/${o.n}/shipment/status`).set(A).send({ status: "IN_TRANSIT", note: "Left Jammu hub" })).status).toBe(200);
    const t = (await api().get(`/v1/orders/${o.n}/tracking?phone=${o.ph}`)).body.data.shipment; expect(t.status).toBe("IN_TRANSIT"); expect(t.trackingUrl).toContain("https://example.com/track"); expect(t.events.map((e: any) => e.status)).toEqual(["BOOKED", "IN_TRANSIT"]);
    expect(JSON.stringify(t)).not.toMatch(/staff|admin-key|#/); expect((await api().get(`/v1/orders/${o.n}/tracking`)).status).toBe(404); expect((await api().get(`/v1/orders/${o.n}/tracking?phone=9123456789`)).status).toBe(404);
  });
  it("rejects unsafe tracking links, duplicate numbers, a second active shipment and impossible status moves", async () => {
    const o = await order(); await T(o.n, "PICKING"); await T(o.n, "PACKED");
    expect((await ship(o.n, { carrier: "DTDC", awb: anAwb(), trackingUrl: "javascript:alert(1)" })).body.error.code).toBe("INVALID_TRACKING_URL"); expect((await ship(o.n, { carrier: "DTDC", awb: "x y" })).status).toBe(422);
    const awb = anAwb(); expect((await ship(o.n, { carrier: "DTDC", awb })).status).toBe(200); expect((await ship(o.n, { carrier: "DTDC", awb: anAwb() })).body.error.code).toBe("SHIPMENT_EXISTS");
    const o2 = await order(); await T(o2.n, "PICKING"); await T(o2.n, "PACKED"); expect((await ship(o2.n, { carrier: "DTDC", awb })).body.error.code).toBe("AWB_IN_USE");
    await api().post(`/v1/admin/orders/${o.n}/shipment/status`).set(A).send({ status: "DELIVERED" });
    expect((await api().post(`/v1/admin/orders/${o.n}/shipment/status`).set(A).send({ status: "IN_TRANSIT" })).body.error.code).toBe("INVALID_TRANSITION");
  });
  it("a failed delivery can be rebooked with a new shipment", async () => {
    const o = await order(); await T(o.n, "PICKING"); await T(o.n, "PACKED"); await ship(o.n, { carrier: "DTDC", awb: anAwb() });
    await api().post(`/v1/admin/orders/${o.n}/shipment/status`).set(A).send({ status: "FAILED", note: "Customer unreachable" });
    const second = anAwb(); expect((await ship(o.n, { carrier: "Delhivery", awb: second })).status).toBe(200);
    expect((await api().get(`/v1/orders/${o.n}/tracking?phone=${o.ph}`)).body.data.shipment.awb).toBe(second);
  });
});

describe("order notes", () => {
  it("are internal: staff see them with the author, customers never do", async () => {
    const o = await order(); const r = await api().post(`/v1/admin/orders/${o.n}/notes`).set(A).send({ body: "Customer asked to deliver after 6 pm" }); expect(r.status).toBe(200);
    expect(r.body.data.notes[0]).toMatchObject({ body: "Customer asked to deliver after 6 pm" }); expect(r.body.data.notes[0].author).toContain("admin-key");
    expect(JSON.stringify((await api().get(`/v1/orders/${o.n}?phone=${o.ph}`)).body)).not.toContain("after 6 pm");
    expect((await api().post(`/v1/admin/orders/${o.n}/notes`).set(A).send({ body: "  " })).status).toBe(422);
  });
});

describe("cart and wishlist", () => {
  it("need a signed-in customer", async () => { for (const p of ["/v1/cart", "/v1/wishlist"]) expect((await api().get(p)).status).toBe(401); });
  it("the cart stores quantities, takes prices from the catalogue, removes at zero and rejects retired items", async () => {
    const { H } = await signIn(); expect((await api().get("/v1/cart").set(H)).body.data.items).toEqual([]);
    const r = await api().put("/v1/cart/items").set(H).send({ sku: "JF002-STE-M", quantity: 2, pricePaise: 1 }); expect(r.status).toBe(200); expect(r.body.data.items[0]).toMatchObject({ sku: "JF002-STE-M", quantity: 2 }); expect(r.body.data.items[0].pricePaise).toBeGreaterThan(100);
    expect((await api().put("/v1/cart/items").set(H).send({ sku: "JF002-STE-M", quantity: 3 })).body.data.items[0].quantity).toBe(3);
    expect((await api().put("/v1/cart/items").set(H).send({ sku: "JF002-STE-M", quantity: 11 })).status).toBe(422); expect((await api().put("/v1/cart/items").set(H).send({ sku: "NOPE", quantity: 1 })).body.error.code).toBe("INVALID_SKU");
    expect((await api().put("/v1/cart/items").set(H).send({ sku: "JF002-STE-M", quantity: 0 })).body.data.items).toEqual([]);
  });
  it("signing in merges the guest bag: quantities add up to the limit, unknown items are reported, another customer sees nothing", async () => {
    const a = await signIn(), b = await signIn(); await api().put("/v1/cart/items").set(a.H).send({ sku: "JF002-STE-M", quantity: 8 });
    const m = await api().post("/v1/cart/merge").set(a.H).send({ lines: [{ sku: "JF002-STE-M", quantity: 5 }, { sku: "JF002-STE-L", quantity: 1 }, { sku: "GONE", quantity: 1 }] });
    expect(m.body.data.skipped).toEqual(["GONE"]); expect(m.body.data.items.find((i: any) => i.sku === "JF002-STE-M").quantity).toBe(10); expect(m.body.data.items.find((i: any) => i.sku === "JF002-STE-L").quantity).toBe(1);
    expect((await api().get("/v1/cart").set(b.H)).body.data.items).toEqual([]); expect((await api().delete("/v1/cart").set(a.H)).status).toBe(200); expect((await api().get("/v1/cart").set(a.H)).body.data.items).toEqual([]);
  });
  it("the wishlist adds, lists, removes and ignores hidden products", async () => {
    const { H } = await signIn(); const slug = (await db.productVariant.findUniqueOrThrow({ where: { sku: "JF002-STE-M" }, include: { product: true } })).product.slug;
    expect((await api().put(`/v1/wishlist/${slug}`).set(H)).body.data.map((x: any) => x.slug)).toEqual([slug]); expect((await api().put(`/v1/wishlist/${slug}`).set(H)).body.data).toHaveLength(1); // adding twice is harmless
    expect((await api().put("/v1/wishlist/no-such-product").set(H)).status).toBe(404);
    await db.product.update({ where: { slug }, data: { status: "DRAFT" } }); expect((await api().get("/v1/wishlist").set(H)).body.data).toEqual([]); await db.product.update({ where: { slug }, data: { status: "ACTIVE" } });
    expect((await api().delete(`/v1/wishlist/${slug}`).set(H)).body.data).toEqual([]);
  });
});
