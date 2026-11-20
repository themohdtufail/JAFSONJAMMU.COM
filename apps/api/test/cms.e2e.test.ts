import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

let app: INestApplication, db: PrismaService; const A = { "x-admin-key": "test-admin" }; const api = () => request(app.getHttpServer());
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); await db.siteContent.deleteMany(); await db.siteContentRevision.deleteMany(); });
afterAll(async () => { await app.close(); });
const jpeg = (w = 1200, h = 900) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 60, b: 120 } } }).jpeg().toBuffer();
const upload = async (alt = "pic") => (await api().post(`/v1/admin/media/upload?alt=${alt}`).set(A).set("content-type", "image/jpeg").send(await jpeg())).body.data;
const getC = async (k: string) => (await api().get(`/v1/admin/content/${k}`).set(A)).body.data;
const putC = (k: string, data: unknown, v: number) => api().put(`/v1/admin/content/${k}`).set(A).send({ data, expectedVersion: v });
async function staffToken(email: string, role: "STAFF" | "MANAGER") { await api().post("/v1/admin/staff").set(A).send({ email, name: "Cms Test", password: "correct-horse-battery", role }); return { authorization: `Bearer ${(await api().post("/v1/admin/auth/login").send({ email, password: "correct-horse-battery" })).body.data.token}` }; }

describe("site content: banners, announcement and pages", () => {
  it("shows the original content until someone edits it, and the public endpoints are cacheable and need no sign-in", async () => {
    const h = await api().get("/v1/content/home"); expect(h.status).toBe(200); expect(h.headers["cache-control"]).toContain("stale-while-revalidate"); expect(h.body.data.hero.slides.map((s: any) => s.id)).toEqual(["menswear", "kidswear"]); expect(h.body.data.hero.slides[0].image).toBeNull();
    expect((await api().get("/v1/content/announcement")).body.data).toMatchObject({ active: true }); const idx = (await api().get("/v1/content/pages")).body.data; expect(idx.map((p: any) => p.slug)).toEqual(expect.arrayContaining(["about", "faq", "shipping", "returns", "privacy", "terms", "contact"]));
    const about = (await api().get("/v1/content/pages/about")).body.data; expect(about.title).toBe("About JAFSON"); expect(about.sections[0]).toMatchObject({ heading: "Where we began" }); expect((await api().get("/v1/content/pages/nope")).status).toBe(404);
  });

  it("a manager edits a banner; the shop sees it; history is kept; stale editors are stopped; undo works", async () => {
    const cur = await getC("home"); expect(cur).toMatchObject({ version: 0, isDefault: true }); const home = JSON.parse(JSON.stringify(cur.data)); home.hero.slides[0].headline = "Winter edit is here";
    const s1 = await putC("home", home, 0); expect(s1.status).toBe(200); expect(s1.body.data.version).toBe(1); expect((await api().get("/v1/content/home")).body.data.hero.slides[0].headline).toBe("Winter edit is here");
    const stale = await putC("home", home, 0); expect(stale.status).toBe(409); expect(stale.body.error.code).toBe("CONTENT_CHANGED");
    home.hero.slides[0].headline = "Second edit"; expect((await putC("home", home, 1)).body.data.version).toBe(2);
    expect((await api().get("/v1/admin/content/home/revisions").set(A)).body.data.map((r: any) => r.version)).toEqual([2, 1]);
    const undo = await api().post("/v1/admin/content/home/revert?version=1").set(A); expect(undo.body.data.version).toBe(3); expect((await api().get("/v1/content/home")).body.data.hero.slides[0].headline).toBe("Winter edit is here");
  });

  it("two people saving at the same moment: exactly one wins, nothing is overwritten", async () => {
    const cur = await getC("announcement"); const base = cur.version;
    const rs = await Promise.all([putC("announcement", { active: true, text: "Offer A", href: "" }, base), putC("announcement", { active: true, text: "Offer B", href: "" }, base)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]); const final = (await getC("announcement")).data.text; expect(["Offer A", "Offer B"]).toContain(final);
  });

  it("refuses unsafe links, empty banner lists, a button without a link, and backwards dates", async () => {
    const home = JSON.parse(JSON.stringify((await getC("home")).data)); const v = (await getC("home")).version; const bad = (mut: (h: any) => void) => { const h = JSON.parse(JSON.stringify(home)); mut(h); return putC("home", h, v); };
    for (const href of ["javascript:alert(1)", "//evil.example.com", "http://insecure.example.com", "data:text/html,<script>1</script>"]) expect((await bad((h) => (h.hero.slides[0].ctaHref = href))).status).toBe(422);
    expect((await bad((h) => (h.hero.slides = []))).status).toBe(422); expect((await bad((h) => { h.hero.slides[0].ctaHref = ""; })).status).toBe(422);
    expect((await bad((h) => { h.hero.slides[0].startsAt = "2026-12-01T00:00:00Z"; h.hero.slides[0].endsAt = "2026-11-01T00:00:00Z"; })).status).toBe(422); expect((await bad((h) => (h.hero.slides[0].headline = ""))).status).toBe(422);
    expect((await bad((h) => (h.hero.slides[0].mediaId = "11111111-1111-4111-8111-111111111111"))).body.error.code).toBe("MEDIA_NOT_FOUND"); expect((await bad((h) => (h.hero.slides[1].id = h.hero.slides[0].id))).body.error.code).toBe("DUPLICATE_ID");
    expect((await putC("pages", { "Bad Slug!": { title: "x y", intro: "", sections: [{ heading: "h", body: "b" }] } }, 0)).status).toBe(422); expect((await api().put("/v1/admin/content/secrets").set(A).send({ data: {}, expectedVersion: 0 })).status).toBe(404);
  });

  it("shows banners only inside their dates, never leaves the shop without a banner, and uses library pictures with sizes", async () => {
    const pic = await upload("Hero picture"); const home = JSON.parse(JSON.stringify((await getC("home")).data)); const v = (await getC("home")).version;
    const slide = (id: string, extra: object) => ({ id, theme: "neutral", eyebrow: "", headline: id, text: "", ctaLabel: "", ctaHref: "", mediaId: null, active: true, ...extra });
    home.hero.slides = [slide("future-sale", { startsAt: new Date(Date.now() + 86400_000).toISOString() }), slide("past-sale", { endsAt: new Date(Date.now() - 86400_000).toISOString() }), slide("switched-off", { active: false }), slide("live-now", { mediaId: pic.id })];
    expect((await putC("home", home, v)).status).toBe(200); const slides = (await api().get("/v1/content/home")).body.data.hero.slides; expect(slides.map((s: any) => s.id)).toEqual(["live-now"]); expect(slides[0].image).toMatchObject({ alt: "Hero picture" }); expect(slides[0].image.srcset.length).toBeGreaterThan(2); expect(slides[0].image.blur).toMatch(/^data:image\/webp/);
    expect((await api().delete(`/v1/admin/media/${pic.id}`).set(A)).body.error.code).toBe("MEDIA_IN_USE");
    const v2 = (await getC("home")).version; home.hero.slides = [slide("future-only", { startsAt: new Date(Date.now() + 86400_000).toISOString() })]; await putC("home", home, v2);
    expect((await api().get("/v1/content/home")).body.data.hero.slides.map((s: any) => s.id)).toEqual(["menswear", "kidswear"]); // nothing live: the original banners, not an empty hero
  });

  it("pages: edit one, add a new one, switch the announcement off; plain text is stored as text", async () => {
    const pages = JSON.parse(JSON.stringify((await getC("pages")).data)); const v = (await getC("pages")).version; pages.about.sections[0].body = "We are <b>bold</b> & proud.\n\nSecond paragraph."; pages["size-care"] = { title: "Size and care", intro: "Keep it looking new.", sections: [{ heading: "Washing", body: "Cold wash." }] };
    expect((await putC("pages", pages, v)).status).toBe(200); expect((await api().get("/v1/content/pages/about")).body.data.sections[0].body).toBe("We are <b>bold</b> & proud.\n\nSecond paragraph."); expect((await api().get("/v1/content/pages/size-care")).body.data.title).toBe("Size and care"); expect((await api().get("/v1/content/pages")).body.data.map((p: any) => p.slug)).toContain("size-care");
    const a = await getC("announcement"); await putC("announcement", { active: false, text: "Hidden", href: "" }, a.version); expect((await api().get("/v1/content/announcement")).body.data).toBeNull();
  });

  it("is for managers and owners", async () => {
    const staff = await staffToken("cms-staff@t.test", "STAFF"); expect((await api().get("/v1/admin/content/home").set(staff)).status).toBe(403); expect((await api().put("/v1/admin/content/home").set(staff).send({ data: {}, expectedVersion: 0 })).status).toBe(403); expect((await api().get("/v1/admin/content/home")).status).toBe(401);
    expect((await api().get("/v1/admin/content/home").set(await staffToken("cms-mgr@t.test", "MANAGER"))).status).toBe(200);
  });
});

describe("product editing from the back-office", () => {
  const mk = async (name: string, images = ["https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800"]) => (await api().post("/v1/admin/products").set(A).send({ name, brand: "Jafson", collection: "men", category: "Shirts", description: "A test product description.", fabric: "Cotton", fit: "Regular", pricePaise: 149900, images, colours: [{ name: "Navy", hex: "#1c2b4a" }], sizes: ["M", "L"], initialStock: 4, status: "DRAFT" })).body.data.slug as string;
  it("returns everything the editor needs, and edits wording, category and flags without changing the web address", async () => {
    const slug = await mk("Editable Test Shirt"); const p = (await api().get(`/v1/admin/products/${slug}`).set(A)).body.data;
    expect(p).toMatchObject({ slug, name: "Editable Test Shirt", status: "DRAFT", pricePaise: 149900, category: "Shirts" }); expect(p.variants.map((v: any) => [v.size, v.onHand, v.available])).toEqual([["M", 4, 4], ["L", 4, 4]]); expect(p.media[0].external).toBe(true); expect(p.categories).toContain("Shirts");
    const u = await api().put(`/v1/admin/products/${slug}/details`).set(A).send({ name: "Renamed Shirt", description: "A much better description of this shirt.", category: "Polo Shirts", isNew: true, sortOrder: 5 }); expect(u.status).toBe(200); expect(u.body.data).toMatchObject({ slug, name: "Renamed Shirt", category: "Polo Shirts", isNew: true, sortOrder: 5 });
    expect((await api().put(`/v1/admin/products/${slug}/details`).set(A).send({ name: "x" })).status).toBe(422); expect((await api().get("/v1/admin/products/does-not-exist").set(A)).status).toBe(404);
    expect((await api().get("/v1/categories")).body.data.map((c: any) => c.name)).toContain("Polo Shirts");
  });
  it("won't publish a product with no picture or size, and will once it has them", async () => {
    const slug = await mk("Publish Rules Shirt"); await api().put(`/v1/admin/products/${slug}/media`).set(A).send({ items: [] });
    const no = await api().put(`/v1/admin/products/${slug}/status`).set(A).send({ status: "ACTIVE" }); expect(no.status).toBe(422); expect(no.body.error.code).toBe("CANNOT_PUBLISH"); expect(no.body.error.details.problems).toContain("add at least one picture");
    const pic = await upload("Front"); await api().put(`/v1/admin/products/${slug}/media`).set(A).send({ items: [{ mediaId: pic.id, alt: "Front view" }] });
    expect((await api().put(`/v1/admin/products/${slug}/status`).set(A).send({ status: "ACTIVE" })).body.data.status).toBe("ACTIVE"); expect((await api().get(`/v1/products/${slug}`)).status).toBe(200);
    expect((await api().put(`/v1/admin/products/${slug}/status`).set(A).send({ status: "DRAFT" })).body.data.status).toBe("DRAFT"); expect((await api().get(`/v1/products/${slug}`)).status).toBe(404);
  });
  it("manages the picture and video list: add, reorder, remove, with the rules, and the shop gets sizes and previews", async () => {
    const slug = await mk("Media Test Shirt"); const [a, b] = [await upload("Front"), await upload("Back")]; const vid = (await api().post("/v1/admin/media/external").set(A).send({ url: "https://cdn.example.com/c/a.mp4", alt: "Clip", posterId: b.id })).body.data;
    const set = (items: unknown[]) => api().put(`/v1/admin/products/${slug}/media`).set(A).send({ items });
    const ok = await set([{ mediaId: a.id, alt: "Front view" }, { mediaId: b.id }, { mediaId: vid.id }, { url: "https://images.unsplash.com/photo-1?w=800", alt: "Detail" }]); expect(ok.status).toBe(200); expect(ok.body.data.media.map((m: any) => m.kind)).toEqual(["IMAGE", "IMAGE", "VIDEO", "IMAGE"]);
    const pub = (await api().put(`/v1/admin/products/${slug}/status`).set(A).send({ status: "ACTIVE" })).status; expect(pub).toBe(200); const shop = (await api().get(`/v1/products/${slug}`)).body.data;
    expect(shop.media[0]).toMatchObject({ kind: "IMAGE", alt: "Front view", src: a.src }); expect(shop.media[0].srcset.length).toBeGreaterThan(2); expect(shop.media[0].blur).toMatch(/^data:image/); expect(shop.media[2]).toMatchObject({ kind: "VIDEO", src: "https://cdn.example.com/c/a.mp4", poster: b.src }); expect(shop.media[3].srcset).toEqual([]); expect(shop.images).toHaveLength(3); // videos stay out of the picture list
    expect((await set([{ mediaId: b.id }, { mediaId: a.id }])).body.data.media.map((m: any) => m.alt)).toEqual(["Back", "Front"]); // reordered
    expect((await set([{ mediaId: vid.id }, { mediaId: a.id }])).body.error.code).toBe("FIRST_MUST_BE_PICTURE");
    const v2 = (await api().post("/v1/admin/media/external").set(A).send({ url: "https://cdn.example.com/c/b.mp4" })).body.data, v3 = (await api().post("/v1/admin/media/external").set(A).send({ url: "https://cdn.example.com/c/c.webm" })).body.data; expect((await set([{ mediaId: a.id }, { mediaId: vid.id }, { mediaId: v2.id }, { mediaId: v3.id }])).body.error.code).toBe("TOO_MANY_VIDEOS");
    expect((await set([{ mediaId: vid.id }])).status).toBe(422); expect((await set([{ url: "http://insecure.example.com/a.jpg" }])).status).toBe(422); expect((await set([{ url: "javascript:alert(1)" }])).status).toBe(422); expect((await set([{ mediaId: a.id, url: "https://x.example.com/a.jpg" }])).status).toBe(422);
    expect((await set([{ mediaId: "11111111-1111-4111-8111-111111111111" }])).body.error.code).toBe("MEDIA_NOT_FOUND"); expect((await set([])).body.error.code).toBe("NEEDS_PICTURE"); // a published product keeps a picture
    expect((await api().delete(`/v1/admin/media/${b.id}`).set(A)).body.error.code).toBe("MEDIA_IN_USE");
  });
  it("adds sizes and colours with opening stock recorded, switches sizes off safely, and keeps barcodes unique", async () => {
    const slug = await mk("Variant Test Shirt"); const add = await api().post(`/v1/admin/products/${slug}/variants`).set(A).send({ colour: { name: "Navy", hex: "#1c2b4a" }, sizes: ["M", "XL", "XXL"], initialStock: 6 }); expect(add.body.data).toMatchObject({ created: 2, revived: 0 }); // M already existed
    const add2 = await api().post(`/v1/admin/products/${slug}/variants`).set(A).send({ colour: { name: "Olive Green", hex: "#556b2f" }, sizes: ["M", "L"], initialStock: 3 }); expect(add2.body.data.created).toBe(2);
    const p = (await api().get(`/v1/admin/products/${slug}`).set(A)).body.data; const skus = p.variants.map((v: any) => v.sku); expect(new Set(skus).size).toBe(skus.length); expect(skus.every((s: string) => /^JF\d+-[A-Z0-9]+-(M|L|XL|XXL)$/.test(s))).toBe(true); expect(p.variants.find((v: any) => v.colour === "Olive Green" && v.size === "M").onHand).toBe(3);
    const v = p.variants.find((x: any) => x.size === "XL"); expect(await db.inventoryMovement.count({ where: { variant: { sku: v.sku }, movementType: "RECEIPT", quantityDelta: 6 } })).toBe(1);
    expect((await api().patch(`/v1/admin/variants/${v.sku}`).set(A).send({ isActive: false })).status).toBe(200); expect((await api().post(`/v1/admin/products/${slug}/variants`).set(A).send({ colour: { name: "Navy", hex: "#1c2b4a" }, sizes: ["XL"] })).body.data).toMatchObject({ created: 0, revived: 1 });
    expect((await api().patch(`/v1/admin/variants/${v.sku}`).set(A).send({ barcode: "8901234567890" })).status).toBe(200); const other = p.variants.find((x: any) => x.sku !== v.sku).sku; expect((await api().patch(`/v1/admin/variants/${other}`).set(A).send({ barcode: "8901234567890" })).body.error.code).toBe("BARCODE_TAKEN");
    const solo = await mk("Single Size Shirt"); await api().put(`/v1/admin/products/${solo}/status`).set(A).send({ status: "ACTIVE" }); const only = (await api().get(`/v1/admin/products/${solo}`).set(A)).body.data.variants; await api().patch(`/v1/admin/variants/${only[0].sku}`).set(A).send({ isActive: false });
    expect((await api().patch(`/v1/admin/variants/${only[1].sku}`).set(A).send({ isActive: false })).body.error.code).toBe("LAST_SIZE");
  });
  it("manages categories: create with a picture, hide, reorder, and protects ones that have products", async () => {
    const pic = await upload("Cat"); const c = await api().post("/v1/admin/categories").set(A).send({ name: "Linen Edit", collection: "men", mediaId: pic.id }); expect(c.status).toBe(200); expect((await api().post("/v1/admin/categories").set(A).send({ name: "Linen Edit", collection: "men" })).body.error.code).toBe("CATEGORY_EXISTS");
    expect((await api().get("/v1/categories")).body.data.find((x: any) => x.name === "Linen Edit")).toMatchObject({ image: pic.src }); await api().patch(`/v1/admin/categories/${c.body.data.slug}`).set(A).send({ isActive: false }); expect((await api().get("/v1/categories")).body.data.map((x: any) => x.name)).not.toContain("Linen Edit");
    expect((await api().delete(`/v1/admin/media/${pic.id}`).set(A)).body.error.code).toBe("MEDIA_IN_USE"); const used = (await api().get("/v1/admin/categories").set(A)).body.data.find((x: any) => x.products > 0); expect((await api().delete(`/v1/admin/categories/${used.slug}`).set(A)).body.error.code).toBe("CATEGORY_IN_USE");
    expect((await api().delete(`/v1/admin/categories/${c.body.data.slug}`).set(A)).status).toBe(200);
  });
  it("is for managers and owners", async () => { const staff = await staffToken("cat-staff@t.test", "STAFF"); for (const [m, p] of [["get", "/v1/admin/products/jf"], ["put", "/v1/admin/products/jf/media"], ["post", "/v1/admin/categories"], ["get", "/v1/admin/categories"]] as const) expect(((await (api() as any)[m](p).set(staff).send({})) as any).status).toBe(403); });
});
