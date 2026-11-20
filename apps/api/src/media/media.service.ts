import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { ImageError, processImage } from "./image";
import { presign, signedHeaders, type S3Conf } from "./s3";

export interface MediaView { id: string; kind: "IMAGE" | "VIDEO"; alt: string; width: number | null; height: number | null; blur: string | null; color: string | null; bytes: number; createdAt: Date; src: string; srcset: { w: number; url: string }[]; mime: string; storage: string; poster: string | null }
const VIDEO_MIME = ["video/mp4", "video/webm"]; const MAX_VIDEO = 100 * 1024 * 1024;

@Injectable()
export class MediaService {
  private log = new Logger("Media");
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /** S3-compatible storage is used when every setting is present. */
  get s3(): (S3Conf & { publicBase: string }) | null { const c = cfg().mediaS3; return c.endpoint && c.bucket && c.accessKey && c.secretKey && c.publicBase ? { ...c } : null; }

  private variantUrl(a: { id: string; storage: string }, w: number) { return a.storage === "S3" ? `${cfg().mediaS3.publicBase}/media/${a.id}/${w}.webp` : `${cfg().mediaUrlBase}/${a.id}/${w}.webp`; }
  private fileUrl(a: { storage: string; key: string | null; externalUrl: string | null }) { return a.storage === "EXTERNAL" ? a.externalUrl! : `${cfg().mediaS3.publicBase}/${a.key}`; }

  view(a: { id: string; kind: string; alt: string; width: number | null; height: number | null; blur: string | null; color: string | null; bytes: number; createdAt: Date; storage: string; key: string | null; externalUrl: string | null; widths: number[]; mime: string; posterId?: string | null }, posters?: Map<string, string>): MediaView {
    const isImg = a.kind === "IMAGE"; const srcset = isImg ? a.widths.map((w) => ({ w, url: this.variantUrl(a, w) })) : [];
    const best = isImg ? ([...a.widths].reverse().find((w) => w <= 960) ?? a.widths[0]!) : 0;
    return { id: a.id, kind: a.kind as "IMAGE" | "VIDEO", alt: a.alt, width: a.width, height: a.height, blur: a.blur, color: a.color, bytes: a.bytes, createdAt: a.createdAt, mime: a.mime, storage: a.storage,
      src: isImg ? this.variantUrl(a, best) : this.fileUrl(a), srcset, poster: a.posterId ? posters?.get(a.posterId) ?? null : null };
  }
  async viewMany(ids: string[]) {
    const uniq = [...new Set(ids)]; if (!uniq.length) return new Map<string, MediaView>();
    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: uniq } } }); const posterIds = rows.map((r) => r.posterId).filter(Boolean) as string[];
    const posterRows = posterIds.length ? await this.prisma.mediaAsset.findMany({ where: { id: { in: posterIds } } }) : []; const posters = new Map(posterRows.map((p) => [p.id, this.view(p).src]));
    return new Map(rows.map((r) => [r.id, this.view(r, posters)]));
  }

  async config() {
    const [used] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(octet_length(data)), 0)::bigint AS n FROM "MediaBlob"`;
    return { storage: this.s3 ? "S3" : "DATABASE", videoUpload: !!this.s3, maxImageMb: 12, maxVideoMb: 100, dbUsedMb: Math.round(Number(used?.n ?? 0) / 1048576), dbMaxMb: cfg().mediaDbMaxMb };
  }

  private async s3Put(key: string, body: Buffer, type: string) {
    const c = this.s3!; const { url, headers } = signedHeaders(c, "PUT", key, body, type);
    const r = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`storage answered ${r.status}`);
  }
  private async s3Delete(key: string) { const c = this.s3!; const { url, headers } = signedHeaders(c, "DELETE", key, null); await fetch(url, { method: "DELETE", headers, signal: AbortSignal.timeout(15_000) }).catch((e) => this.log.warn(`could not delete ${key}: ${e.message}`)); }

  async uploadImage(buf: Buffer, alt: string, actor: string) {
    let out; try { out = await processImage(buf); } catch (e) { if (e instanceof ImageError) throw new AppError(e.code, e.message, 422); throw e; }
    const size = out.variants.reduce((n, v) => n + v.data.length, 0); const id = randomUUID(); const widths = out.variants.map((v) => v.w);
    if (this.s3) {
      try { for (const v of out.variants) await this.s3Put(`media/${id}/${v.w}.webp`, v.data, "image/webp"); }
      catch (e) { for (const v of out.variants) await this.s3Delete(`media/${id}/${v.w}.webp`); throw new AppError("STORAGE_ERROR", "The picture couldn't be saved to storage. Try again in a moment.", 502); }
      const a = await this.prisma.mediaAsset.create({ data: { id, kind: "IMAGE", mime: "image/webp", bytes: size, width: out.width, height: out.height, alt: alt.slice(0, 200), blur: out.blur, color: out.color, storage: "S3", widths, createdBy: actor } });
      return this.view(a);
    }
    const cf = await this.config(); if (cf.dbUsedMb + size / 1048576 > cf.dbMaxMb) throw new AppError("STORAGE_FULL", `The picture library is full (${cf.dbMaxMb} MB). Delete unused pictures, or connect object storage (Cloudflare R2 or Supabase Storage) for unlimited space.`, 409);
    const a = await this.prisma.mediaAsset.create({ data: { id, kind: "IMAGE", mime: "image/webp", bytes: size, width: out.width, height: out.height, alt: alt.slice(0, 200), blur: out.blur, color: out.color, storage: "DATABASE", widths, createdBy: actor, blobs: { create: out.variants.map((v) => ({ variant: v.w, data: new Uint8Array(v.data) })) } } });
    return this.view(a);
  }

  async registerExternalVideo(url: string, alt: string, posterId: string | undefined, actor: string) {
    let u: URL; try { u = new URL(url); } catch { throw new AppError("INVALID_URL", "That isn't a valid web address.", 422); }
    if (u.protocol !== "https:") throw new AppError("INVALID_URL", "The video link must start with https://", 422);
    if (!/\.(mp4|webm)$/i.test(u.pathname)) throw new AppError("INVALID_VIDEO", "Link to an .mp4 or .webm file.", 422);
    if (posterId && !(await this.prisma.mediaAsset.findFirst({ where: { id: posterId, kind: "IMAGE" } }))) throw new AppError("INVALID_POSTER", "The cover picture wasn't found.", 422);
    const a = await this.prisma.mediaAsset.create({ data: { kind: "VIDEO", mime: u.pathname.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4", bytes: 0, alt: alt.slice(0, 200), storage: "EXTERNAL", externalUrl: u.toString(), widths: [], posterId: posterId ?? null, createdBy: actor } });
    return (await this.viewMany([a.id])).get(a.id)!;
  }

  /** Step one of a video upload: the browser receives a short-lived link and sends the file straight to storage, so large videos never pass through this server. */
  presignVideo(mime: string, bytes: number) {
    if (!this.s3) throw new AppError("NO_STORAGE", "Video upload needs object storage (Cloudflare R2 or Supabase Storage). Until then, link to a video file instead.", 409);
    if (!VIDEO_MIME.includes(mime)) throw new AppError("INVALID_VIDEO", "Use an MP4 or WebM video.", 422);
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_VIDEO) throw new AppError("FILE_TOO_LARGE", "Videos can be up to 100 MB.", 422);
    const key = `media/videos/${randomUUID()}.${mime === "video/webm" ? "webm" : "mp4"}`;
    return { key, method: "PUT", uploadUrl: presign(this.s3, "PUT", key, 900), headers: {} as Record<string, string>, expiresInSeconds: 900 };
  }
  async completeVideo(key: string, alt: string, posterId: string | undefined, actor: string) {
    if (!this.s3) throw new AppError("NO_STORAGE", "Object storage is not configured.", 409);
    const m = /^media\/videos\/[0-9a-f-]{36}\.(mp4|webm)$/.exec(key); if (!m) throw new AppError("INVALID_KEY", "That upload isn't recognised.", 422);
    const { url, headers } = signedHeaders(this.s3, "HEAD", key, null); const r = await fetch(url, { method: "HEAD", headers, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) throw new AppError("UPLOAD_MISSING", "The video didn't arrive in storage. Try uploading it again.", 409);
    const bytes = Number(r.headers.get("content-length") ?? 0); if (bytes <= 0 || bytes > MAX_VIDEO) throw new AppError("FILE_TOO_LARGE", "Videos can be up to 100 MB.", 422);
    const a = await this.prisma.mediaAsset.create({ data: { kind: "VIDEO", mime: m[1] === "webm" ? "video/webm" : "video/mp4", bytes, alt: alt.slice(0, 200), storage: "S3", key, widths: [], posterId: posterId ?? null, createdBy: actor } });
    return (await this.viewMany([a.id])).get(a.id)!;
  }

  /** Serves one stored picture size. Cached for a year: an asset id never changes its content. */
  async blob(id: string, w: number) { const b = await this.prisma.mediaBlob.findUnique({ where: { assetId_variant: { assetId: id, variant: w } } }); return b ? Buffer.from(b.data) : null; }

  async list(q: { kind?: string; q?: string; limit: number; offset: number }) {
    const where = { ...(q.kind ? { kind: q.kind } : {}), ...(q.q ? { alt: { contains: q.q, mode: "insensitive" as const } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset }), this.prisma.mediaAsset.count({ where })]);
    const posters = await this.viewMany(rows.map((r) => r.posterId).filter(Boolean) as string[]);
    return { total, items: rows.map((r) => this.view(r, new Map([...posters].map(([k, v]) => [k, v.src])))) };
  }
  async setAlt(id: string, alt: string) { const r = await this.prisma.mediaAsset.updateMany({ where: { id }, data: { alt: alt.slice(0, 200) } }); if (!r.count) throw new AppError("NOT_FOUND", "Media not found", 404); return { id, alt }; }

  async usage(id: string) {
    const [prod, cat, site] = await Promise.all([
      this.prisma.productImage.findMany({ where: { OR: [{ mediaId: id }, { posterId: id }] }, select: { product: { select: { name: true } } } }),
      this.prisma.category.findMany({ where: { imageUrl: { contains: id } }, select: { name: true } }),
      this.prisma.$queryRaw<{ key: string }[]>`SELECT key FROM "SiteContent" WHERE data::text LIKE ${"%" + id + "%"}`,
    ]);
    return [...prod.map((p) => `Product: ${p.product.name}`), ...cat.map((c) => `Category: ${c.name}`), ...site.map((s) => `Site content: ${s.key}`)];
  }
  async remove(id: string) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id } }); if (!a) throw new AppError("NOT_FOUND", "Media not found", 404);
    const used = await this.usage(id); if (used.length) throw new AppError("MEDIA_IN_USE", `This is still used by: ${[...new Set(used)].slice(0, 5).join(", ")}. Remove it there first.`, 409, { usedBy: used });
    const posterUse = await this.prisma.mediaAsset.count({ where: { posterId: id } }); if (posterUse) throw new AppError("MEDIA_IN_USE", "This picture is the cover of a video. Delete the video first.", 409);
    if (a.storage === "S3") { if (a.kind === "IMAGE") for (const w of a.widths) await this.s3Delete(`media/${id}/${w}.webp`); else if (a.key) await this.s3Delete(a.key); }
    await this.prisma.mediaAsset.delete({ where: { id } }); return { deleted: true };
  }
}
