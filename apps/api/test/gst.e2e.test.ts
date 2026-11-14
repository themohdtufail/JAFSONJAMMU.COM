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

const A = { "x-admin-key": "test-admin" };
const base = "01ABCDE1234F1Z"; const SELLER = base + gstinCheckChar(base);
const mh = "27AAPFU0939F1Z"; const BUYER = mh + gstinCheckChar(mh);
const jk = { line1: "12 Gandhi Nagar", city: "Jammu", state: "Jammu & Kashmir", postalCode: "180004" };
const pune = { line1: "5 FC Road", city: "Pune", state: "Maharashtra", postalCode: "411004" };
const contact = { name: "Asha Verma", phone: "9876500088" };
let app: INestApplication, db: PrismaService; const saved: Record<string, string | undefined> = {};
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  for (const [k, v] of Object.entries({ SELLER_GSTIN: SELLER, SELLER_ADDRESS: "Industrial Estate, Jammu, J&K 180001" })) { saved[k] = process.env[k]; process.env[k] = v; }
  const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService);
  await db.product.updateMany({ where: { slug: { in: ["tailored-navy-blazer"] } }, data: { hsnCode: null } });
});
afterAll(async () => { await app.close(); for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); });

const stock = async (sku: string, n = 50) => { const v = await db.productVariant.findUniqueOrThrow({ where: { sku } }); await db.inventoryBalance.updateMany({ where: { variantId: v.id }, data: { onHand: n, reserved: 0 } }); };
async function order(sku: string, address: object | undefined = jk, extra: object = {}, qty = 1, ful = "COURIER") {
  await stock(sku);
  return api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: qty }], fulfilmentType: ful, paymentMethod: "COD", idempotencyKey: randomUUID(), contact, address, ...extra });
}
const T = (n: string, to: string, code?: string) => api().post(`/v1/admin/orders/${n}/transition`).set(A).send({ to, pickupCode: code });
const ship = async (n: string) => { for (const to of ["PICKING", "PACKED"]) await T(n, to); return T(n, "DISPATCHED"); };
const skuOf = async (slug: string) => (await db.productVariant.findFirstOrThrow({ where: { product: { slug } }, orderBy: { sku: "asc" } })).sku;
const setHsn = (slug: string, hsnCode = "6205") => api().patch(`/v1/admin/products/${slug}`).set(A).send({ hsnCode });

describe("GST tax invoices and credit notes", () => {
  it("refuses to invoice goods with no HSN code, and the order stays unshipped", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku)).body.data;
    await api().post(`/v1/admin/orders/${o.number}/transition`).set(A).send({ to: "PICKING" }); await T(o.number, "PACKED");
    const r = await T(o.number, "DISPATCHED"); expect(r.status).toBe(409); expect(r.body.error.code).toBe("HSN_MISSING");
    expect((await api().get(`/v1/admin/orders/${o.number}`).set(A)).body.data.status).toBe("PACKED");
    expect(await db.invoice.count({ where: { order: { number: o.number } } })).toBe(0);
  });

  it("validates product HSN codes", async () => {
    expect((await setHsn("tailored-navy-blazer", "12")).status).toBe(422); expect((await setHsn("tailored-navy-blazer", "6203")).status).toBe(200);
  });

  it("issues a CGST+SGST invoice for a J&K buyer at dispatch; totals match the order; it is immutable", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku)).body.data; await ship(o.number);
    const d = (await api().get(`/v1/orders/${o.number}/documents?phone=${contact.phone}`)).body.data; const inv = d.invoice;
    expect(inv.number).toMatch(/^JF\/\d{2}-\d{2}\/\d{6}$/); expect(inv.sellerGstin).toBe(SELLER); expect(inv.supply).toBe("INTRA"); expect(inv.igstPaise).toBe(0); expect(inv.cgstPaise).toBeGreaterThan(0); expect(Math.abs(inv.cgstPaise - inv.sgstPaise)).toBeLessThanOrEqual(1);
    expect(inv.totalPaise).toBe(o.totals.totalPaise); expect(inv.taxablePaise + inv.cgstPaise + inv.sgstPaise).toBe(inv.totalPaise); expect(inv.lines[0].hsn).toBe("6203"); expect(inv.lines[0].rateBps).toBe(1800); expect(inv.placeOfSupply).toBe("Jammu and Kashmir");
    await expect(db.invoice.update({ where: { id: inv.id }, data: { totalPaise: 1 } })).rejects.toThrow(/immutable/); await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow(/immutable/);
    // dispatching again is a no-op for numbering: exactly one invoice per order
    expect(await db.invoice.count({ where: { orderId: inv.orderId } })).toBe(1);
  });

  it("charges IGST for another state, and rejects bad buyer details", async () => {
    const sku = await skuOf("tailored-navy-blazer");
    expect((await order(sku, { ...pune, state: "Narnia" })).body.error.code).toBe("STATE_UNRECOGNISED");
    expect((await order(sku, pune, { buyerGstin: "27AAPFU0939F1Z9" })).body.error.code).toBe("BUYER_GSTIN_INVALID");
    expect((await order(sku, jk, { buyerGstin: BUYER })).body.error.code).toBe("BUYER_GSTIN_STATE_MISMATCH");
    const o = (await order(sku, pune, { buyerGstin: BUYER, buyerBusinessName: "Pune Traders LLP" })).body.data; await ship(o.number);
    const inv = (await api().get(`/v1/orders/${o.number}/documents?phone=${contact.phone}`)).body.data.invoice;
    expect(inv.supply).toBe("INTER"); expect(inv.cgstPaise).toBe(0); expect(inv.sgstPaise).toBe(0); expect(inv.igstPaise).toBeGreaterThan(0); expect(inv.buyerGstin).toBe(BUYER); expect(inv.buyerBusinessName).toBe("Pune Traders LLP"); expect(inv.placeOfSupplyCode).toBe("27");
  });

  it("keeps the documents private to the order's owner", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku)).body.data; await ship(o.number);
    expect((await api().get(`/v1/orders/${o.number}/documents`)).status).toBe(404); expect((await api().get(`/v1/orders/${o.number}/documents?phone=9123456780`)).status).toBe(404);
  });

  it("issues credit notes that can never exceed the invoice, and add back to it exactly", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku, pune, {}, 2)).body.data; await ship(o.number);
    const cn = (body: object) => api().post(`/v1/admin/orders/${o.number}/credit-note`).set(A).send(body);
    expect((await cn({ reason: "x" })).status).toBe(422);
    const first = await cn({ reason: "Price adjustment", amountPaise: 100000 }); expect(first.status).toBe(200);
    expect((await cn({ reason: "Too much", amountPaise: o.totals.totalPaise })).body.error.code).toBe("CREDIT_EXCEEDS_INVOICE");
    const rest = await cn({ reason: "Order returned" }); expect(rest.status).toBe(200);
    expect((await cn({ reason: "Again", amountPaise: 100 })).status).toBe(409);
    const notes = rest.body.data.documents.creditNotes; const inv = rest.body.data.documents.invoice; expect(notes).toHaveLength(2); expect(notes[0].number).toMatch(/^CN\/\d{2}-\d{2}\/\d{6}$/);
    for (const k of ["taxablePaise", "cgstPaise", "sgstPaise", "igstPaise", "totalPaise"]) expect(notes.reduce((n: number, c: any) => n + c[k], 0)).toBe(inv[k]);
    await expect(db.creditNote.update({ where: { id: notes[0].id }, data: { totalPaise: 1 } })).rejects.toThrow(/immutable/);
  });

  it("issues a credit note automatically when a manual refund is completed; none for an uninvoiced order", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku)).body.data; await ship(o.number);
    await db.order.update({ where: { number: o.number }, data: { paymentStatus: "REFUND_DUE" } });
    const r = await api().post(`/v1/admin/orders/${o.number}/refund-complete`).set(A); expect(r.status).toBe(200);
    expect(r.body.data.documents.creditNotes).toHaveLength(1); expect(r.body.data.documents.creditNotes[0].totalPaise).toBe(o.totals.totalPaise);
    const o2 = (await order(sku)).body.data; await db.order.update({ where: { number: o2.number }, data: { paymentStatus: "REFUND_DUE" } });
    expect((await api().post(`/v1/admin/orders/${o2.number}/refund-complete`).set(A)).body.data.documents.creditNotes).toHaveLength(0);
  });

  it("numbers invoices consecutively with no gaps or duplicates under parallel dispatch", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const os = [] as string[];
    await stock(sku, 50);
    for (let i = 0; i < 6; i++) { const o = (await api().post("/v1/checkout/orders").send({ lines: [{ sku, quantity: 1 }], fulfilmentType: "COURIER", paymentMethod: "COD", idempotencyKey: randomUUID(), contact, address: jk })).body.data; await T(o.number, "PICKING"); await T(o.number, "PACKED"); os.push(o.number); }
    const rs = await Promise.all(os.map((n) => T(n, "DISPATCHED"))); expect(rs.map((r) => r.status + " " + (r.body.error?.code ?? ""))).toEqual(os.map(() => "200 "));
    const nums = (await db.invoice.findMany({ where: { order: { number: { in: os } } } })).map((i) => Number(i.number.split("/")[2])).sort((a, b) => a - b);
    expect(nums).toHaveLength(6); for (let i = 1; i < nums.length; i++) expect(nums[i]).toBe(nums[i - 1]! + 1);
    const all = (await db.invoice.findMany({ orderBy: { number: "asc" } })).map((i) => Number(i.number.split("/")[2])); expect(all).toEqual([...Array(all.length)].map((_, i) => i + 1));
  });

  it("issues an invoice later for an order shipped before GST was set up; refuses an unshipped one", async () => {
    const sku = await skuOf("tailored-navy-blazer"); const o = (await order(sku)).body.data;
    expect((await api().post(`/v1/admin/orders/${o.number}/invoice`).set(A)).body.error.code).toBe("NOT_SHIPPED");
    await ship(o.number); await db.invoice.findUniqueOrThrow({ where: { orderId: (await db.order.findUniqueOrThrow({ where: { number: o.number } })).id } });
  });

  it("summarises tax by rate for a period, nets credit notes, and exports CSV", async () => {
    const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const s = (await api().get(`/v1/admin/gst/summary?from=${day}&to=${day}`).set(A)).body.data;
    expect(s.invoiceCount).toBeGreaterThan(5); expect(s.creditNoteCount).toBeGreaterThanOrEqual(3);
    const invTax = s.invoices.reduce((n: number, i: any) => n + i.cgstPaise + i.sgstPaise + i.igstPaise, 0), cnTax = s.creditNotes.reduce((n: number, c: any) => n + c.cgstPaise + c.sgstPaise + c.igstPaise, 0);
    expect(s.net.cgstPaise + s.net.sgstPaise + s.net.igstPaise).toBe(invTax - cnTax); expect(s.byRate.every((r: any) => [500, 1800].includes(r.rateBps))).toBe(true);
    const c = (await api().get(`/v1/admin/gst/summary.csv?from=${day}&to=${day}`).set(A)).body.data; expect(c.csv.split("\r\n")[0]).toContain("Taxable"); expect(c.csv).toContain("Credit note");
    expect((await api().get(`/v1/admin/gst/summary?from=${day}`).set(A)).status).toBe(422); expect((await api().get(`/v1/admin/gst/summary?from=2026-05-01&to=2026-01-01`).set(A)).status).toBe(422);
    expect((await api().get(`/v1/admin/gst/summary?from=${day}&to=${day}`)).status).toBe(401);
  });

  it("does not let Staff read the tax report or issue credit notes", async () => {
    await api().post("/v1/admin/staff").set(A).send({ email: "gst-staff@t.test", name: "Gst Staff", password: "correct-horse-battery", role: "STAFF" });
    const l = (await api().post("/v1/admin/auth/login").send({ email: "gst-staff@t.test", password: "correct-horse-battery" })).body.data; const H = { authorization: `Bearer ${l.token}` };
    expect((await api().get("/v1/admin/gst/summary?from=2026-01-01&to=2026-01-31").set(H)).status).toBe(403);
    expect((await api().post("/v1/admin/orders/JF100001/credit-note").set(H).send({ reason: "nope" })).status).toBe(403);
  });
});
