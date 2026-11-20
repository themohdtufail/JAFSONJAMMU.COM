import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/common/http";
import { PrismaService } from "../src/common/prisma.service";

let app: INestApplication, db: PrismaService; const A = { "x-admin-key": "test-admin" }; const api = () => request(app.getHttpServer()); const saved: Record<string, string | undefined> = {};
const env = (v: Record<string, string>) => { for (const [k, x] of Object.entries(v)) { if (!(k in saved)) saved[k] = process.env[k]; process.env[k] = x; } };
beforeAll(async () => { const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication({ rawBody: true }); configureApp(app); await app.init(); db = app.get(PrismaService); });
afterAll(async () => { await app.close(); for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); });

const jpeg = (w = 1800, h = 1200, extra?: (s: Sharp) => Sharp) => { let s = sharp({ create: { width: w, height: h, channels: 3, background: { r: 241, g: 82, b: 29 } } }); if (extra) s = extra(s); return s.jpeg().toBuffer(); };
const up = (buf: Buffer, type = "image/jpeg", alt = "A test picture", h: Record<string, string> = A) => api().post(`/v1/admin/media/upload?alt=${encodeURIComponent(alt)}`).set(h).set("content-type", type).send(buf);

describe("picture upload", () => {
  it("turns an upload into several WebP sizes with a blur preview and colour, and serves them with a year-long cache", async () => {
    const r = await up(await jpeg()); expect(r.status).toBe(200); const m = r.body.data;
    expect(m).toMatchObject({ kind: "IMAGE", alt: "A test picture", width: 1800, height: 1200, storage: "DATABASE" }); expect(m.srcset.map((s: any) => s.w)).toEqual([320, 640, 960, 1440, 1800]);
    expect(m.blur).toMatch(/^data:image\/webp;base64,/); expect(m.blur.length).toBeLessThan(1500); expect(m.color).toMatch(/^#[0-9a-f]{6}$/); expect(m.src).toBe(`/api/v1/media/${m.id}/960.webp`);
    const f = await api().get(`/v1/media/${m.id}/640.webp`); expect(f.status).toBe(200); expect(f.headers["content-type"]).toBe("image/webp"); expect(f.headers["cache-control"]).toContain("immutable"); expect(f.headers["cache-control"]).toContain("max-age=31536000");
    const meta = await sharp(f.body).metadata(); expect(meta.format).toBe("webp"); expect(meta.width).toBe(640); expect(f.body.length).toBeLessThan(5000);
    expect((await api().get(`/v1/media/${m.id}/640.webp`).set("if-none-match", f.headers.etag)).status).toBe(304);
    expect((await api().get(`/v1/media/${m.id}/777.webp`)).status).toBe(404); expect((await api().get(`/v1/media/${m.id}/640.png`)).status).toBe(404); expect((await api().get(`/v1/media/not-an-id/640.webp`)).status).toBe(404);
  });
  it("does not enlarge small pictures, and refuses ones that are too small", async () => {
    const m = (await up(await jpeg(700, 500))).body.data; expect(m.srcset.map((s: any) => s.w)).toEqual([320, 640, 700]);
    const tiny = await up(await jpeg(150, 150)); expect(tiny.status).toBe(422); expect(tiny.body.error.code).toBe("IMAGE_TOO_SMALL");
  });
  it("turns phone photos upright and strips camera and location data", async () => {
    const buf = await jpeg(600, 400, (s) => s.withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-camera-owner" } } }));
    const m = (await up(buf)).body.data; expect([m.width, m.height]).toEqual([400, 600]);
    const v = await api().get(`/v1/media/${m.id}/${m.srcset.at(-1).w}.webp`); const meta = await sharp(v.body).metadata(); expect(meta.exif).toBeUndefined(); expect(Buffer.from(v.body).includes("secret-camera-owner")).toBe(false);
  });
  it("trusts what the bytes are, not what the upload claims, and refuses SVG, text and decompression bombs", async () => {
    const fake = await up(Buffer.from("<script>alert(1)</script> not a picture"), "image/jpeg"); expect(fake.status).toBe(422); expect(fake.body.error.code).toBe("NOT_AN_IMAGE");
    expect((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), "image/svg+xml")).status).toBe(415);
    const bomb = await sharp({ create: { width: 8000, height: 8001, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer(); const b = await up(bomb, "image/png"); expect(b.status).toBe(422); expect(["NOT_AN_IMAGE", "FILE_TOO_LARGE"]).toContain(b.body.error.code);
    const empty = await api().post("/v1/admin/media/upload").set(A).set("content-type", "image/jpeg").send(Buffer.alloc(0)); expect(empty.status).toBeGreaterThanOrEqual(400);
  });
  it("is for managers and owners only", async () => {
    expect((await api().post("/v1/admin/media/upload").set("content-type", "image/jpeg").send(await jpeg())).status).toBe(401);
    await api().post("/v1/admin/staff").set(A).send({ email: "media-staff@t.test", name: "Media Staff", password: "correct-horse-battery", role: "STAFF" });
    const t = (await api().post("/v1/admin/auth/login").send({ email: "media-staff@t.test", password: "correct-horse-battery" })).body.data.token; const H = { authorization: `Bearer ${t}` };
    expect((await up(await jpeg(), "image/jpeg", "x", H)).status).toBe(403); expect((await api().get("/v1/admin/media").set(H)).status).toBe(403); expect((await api().get("/v1/admin/media")).status).toBe(401);
  });
  it("lists, filters, renames and deletes; and stops when the built-in library is full", async () => {
    const m = (await up(await jpeg(800, 800), "image/jpeg", "Unique-needle-photo")).body.data;
    const l = (await api().get("/v1/admin/media?q=unique-needle").set(A)).body.data; expect(l.items.map((x: any) => x.id)).toContain(m.id);
    expect((await api().patch(`/v1/admin/media/${m.id}`).set(A).send({ alt: "Renamed" })).body.data.alt).toBe("Renamed");
    env({ MEDIA_DB_MAX_MB: "0" }); const full = await up(await jpeg(800, 800)); expect(full.status).toBe(409); expect(full.body.error.code).toBe("STORAGE_FULL"); env({ MEDIA_DB_MAX_MB: "200" });
    expect((await api().delete(`/v1/admin/media/${m.id}`).set(A)).status).toBe(200); expect((await api().get(`/v1/media/${m.id}/640.webp`)).status).toBe(404); expect((await db.mediaBlob.count({ where: { assetId: m.id } }))).toBe(0);
  });
});

describe("videos", () => {
  it("links to a hosted video with a cover picture, and rejects unsafe links", async () => {
    const poster = (await up(await jpeg(800, 800))).body.data;
    const v = await api().post("/v1/admin/media/external").set(A).send({ url: "https://cdn.example.com/clips/shirt.mp4", alt: "Shirt movement", posterId: poster.id }); expect(v.status).toBe(200); expect(v.body.data).toMatchObject({ kind: "VIDEO", src: "https://cdn.example.com/clips/shirt.mp4", storage: "EXTERNAL", poster: poster.src });
    for (const url of ["http://cdn.example.com/a.mp4", "https://cdn.example.com/a.exe", "javascript:alert(1)", "not a url"]) expect((await api().post("/v1/admin/media/external").set(A).send({ url })).status).toBe(422);
    expect((await api().delete(`/v1/admin/media/${poster.id}`).set(A)).body.error.code).toBe("MEDIA_IN_USE"); // it is the cover of a video
  });
  it("without object storage, direct video upload is refused with a clear reason", async () => {
    const r = await api().post("/v1/admin/media/presign").set(A).send({ mime: "video/mp4", bytes: 1_000_000 }); expect(r.status).toBe(409); expect(r.body.error.code).toBe("NO_STORAGE");
    expect((await api().get("/v1/admin/media/config").set(A)).body.data).toMatchObject({ storage: "DATABASE", videoUpload: false });
  });
});

describe("with S3-compatible storage (R2, Supabase Storage, AWS)", () => {
  let fake: Server; const store = new Map<string, number>(); const log: { method: string; path: string; auth: string }[] = [];
  beforeAll(async () => {
    fake = createServer((req, res) => { const chunks: Buffer[] = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => { const path = new URL(req.url!, "http://x").pathname; log.push({ method: req.method!, path, auth: String(req.headers.authorization ?? "") });
      if (req.method === "PUT") { store.set(path, Buffer.concat(chunks).length); res.writeHead(200); return res.end(); } if (req.method === "DELETE") { store.delete(path); res.writeHead(204); return res.end(); }
      if (req.method === "HEAD") { const n = store.get(path); res.writeHead(n ? 200 : 404, n ? { "content-length": String(n) } : {}); return res.end(); } res.writeHead(404); res.end(); }); });
    await new Promise<void>((r) => fake.listen(0, r)); env({ MEDIA_S3_ENDPOINT: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, MEDIA_S3_BUCKET: "jafson", MEDIA_S3_REGION: "auto", MEDIA_S3_ACCESS_KEY: "AKTEST", MEDIA_S3_SECRET_KEY: "secret-test", MEDIA_PUBLIC_BASE: "https://media.example.com" });
  });
  afterAll(() => { fake.close(); for (const k of ["MEDIA_S3_ENDPOINT", "MEDIA_S3_BUCKET", "MEDIA_S3_ACCESS_KEY", "MEDIA_S3_SECRET_KEY", "MEDIA_PUBLIC_BASE"]) delete process.env[k]; });
  it("stores picture sizes in storage with signed requests and links straight to the public address", async () => {
    const m = (await up(await jpeg(1200, 800))).body.data; expect(m.storage).toBe("S3"); expect(m.src).toBe(`https://media.example.com/media/${m.id}/960.webp`);
    const puts = log.filter((l) => l.method === "PUT" && l.path.includes(m.id)); expect(puts).toHaveLength(m.srcset.length); expect(puts.every((p) => p.auth.startsWith("AWS4-HMAC-SHA256 Credential=AKTEST/") && p.auth.includes("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date"))).toBe(true);
    expect((await db.mediaBlob.count({ where: { assetId: m.id } }))).toBe(0); // nothing in the database
    expect((await api().delete(`/v1/admin/media/${m.id}`).set(A)).status).toBe(200); expect(log.filter((l) => l.method === "DELETE" && l.path.includes(m.id)).length).toBe(puts.length);
  });
  it("lets the browser upload a video straight to storage, then checks it arrived", async () => {
    expect((await api().get("/v1/admin/media/config").set(A)).body.data).toMatchObject({ storage: "S3", videoUpload: true });
    expect((await api().post("/v1/admin/media/presign").set(A).send({ mime: "video/quicktime", bytes: 1000 })).status).toBe(422); expect((await api().post("/v1/admin/media/presign").set(A).send({ mime: "video/mp4", bytes: 200 * 1024 * 1024 })).status).toBe(422);
    const p = (await api().post("/v1/admin/media/presign").set(A).send({ mime: "video/mp4", bytes: 5_000_000 })).body.data; const u = new URL(p.uploadUrl);
    expect(p.key).toMatch(/^media\/videos\/[0-9a-f-]{36}\.mp4$/); expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/); expect(u.searchParams.get("X-Amz-Expires")).toBe("900"); expect(p.uploadUrl).not.toContain("secret-test");
    expect((await api().post("/v1/admin/media/complete").set(A).send({ key: p.key })).body.error.code).toBe("UPLOAD_MISSING"); // not uploaded yet
    store.set(`/jafson/${p.key}`, 5_000_000); const done = await api().post("/v1/admin/media/complete").set(A).send({ key: p.key, alt: "Runway clip" }); expect(done.status).toBe(200); expect(done.body.data).toMatchObject({ kind: "VIDEO", bytes: 5_000_000, src: `https://media.example.com/${p.key}` });
    expect((await api().post("/v1/admin/media/complete").set(A).send({ key: "media/../../etc/passwd" })).body.error.code).toBe("INVALID_KEY");
  });
});
