import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { MediaService } from "../media/media.service";
import { KEYS, type ContentKey, type Home } from "./schemas";
import { defaultAnnouncement, defaultHome, defaultPages } from "./defaults";

const DEFAULTS: Record<ContentKey, () => unknown> = { home: defaultHome, announcement: defaultAnnouncement, pages: defaultPages };
const isKey = (k: string): k is ContentKey => k in KEYS;

@Injectable()
export class ContentService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(MediaService) private media: MediaService) {}

  private key(k: string): ContentKey { if (!isKey(k)) throw new AppError("NOT_FOUND", "Unknown content", 404); return k; }

  /** The saved content, or the original wording if nothing was saved yet. Stored data is re-validated on read so a bad row can never break the shop. */
  async raw(k: ContentKey) {
    const row = await this.prisma.siteContent.findUnique({ where: { key: k } });
    if (row) { const ok = KEYS[k].safeParse(row.data); if (ok.success) return { data: ok.data as unknown, version: row.version, updatedAt: row.updatedAt, updatedBy: row.updatedBy, isDefault: false }; }
    return { data: DEFAULTS[k]() as unknown, version: row?.version ?? 0, updatedAt: null as Date | null, updatedBy: null as string | null, isDefault: true };
  }

  /** What the storefront receives: only banners that are on and in their dates, with pictures resolved to sizes and previews. */
  async publicHome(now = new Date()) {
    const { data } = await this.raw("home"); const h = data as Home;
    const live = h.hero.slides.filter((s) => s.active && (!s.startsAt || new Date(s.startsAt) <= now) && (!s.endsAt || new Date(s.endsAt) > now));
    const ids = [...live.map((s) => s.mediaId), ...h.categories.items.map((c) => c.mediaId)].filter(Boolean) as string[]; const m = await this.media.viewMany(ids);
    const pic = (id?: string | null) => { const v = id ? m.get(id) : null; return v ? { src: v.src, srcset: v.srcset, width: v.width, height: v.height, blur: v.blur, color: v.color, alt: v.alt } : null; };
    return { ...h, hero: { slides: (live.length ? live : defaultHome().hero.slides).map((s) => ({ ...s, image: pic(s.mediaId) })) }, categories: { ...h.categories, items: h.categories.items.map((c) => ({ ...c, image: pic(c.mediaId) })) } };
  }
  async publicAnnouncement() { const { data } = await this.raw("announcement"); const a = data as { active: boolean; text: string; href: string }; return a.active && a.text ? a : null; }
  async pagesIndex() { const { data } = await this.raw("pages"); return Object.entries(data as Record<string, { title: string }>).map(([slug, p]) => ({ slug, title: p.title })); }
  async page(slug: string) { const { data } = await this.raw("pages"); const p = (data as Record<string, unknown>)[slug]; if (!p) throw new AppError("NOT_FOUND", "Page not found", 404); return { slug, ...(p as object) }; }

  /** The editor's copy, plus the details of any pictures it uses so thumbnails can be shown. */
  async admin(k: string) {
    const key = this.key(k); const r = await this.raw(key); let media: Record<string, unknown> = {};
    if (key === "home") { const h = r.data as Home; const ids = [...h.hero.slides.map((s) => s.mediaId), ...h.categories.items.map((c) => c.mediaId)].filter(Boolean) as string[]; media = Object.fromEntries(await this.media.viewMany(ids)); }
    return { key, ...r, media };
  }

  /**
   * Saves one content document. `expectedVersion` must be the version the editor loaded: if someone else saved in between, nothing is overwritten
   * (409) and the editor is told to reload. Every save is also kept as a revision.
   */
  async save(k: string, input: unknown, expectedVersion: number, actor: string) {
    const key = this.key(k); let data: unknown;
    try { data = KEYS[key].parse(input); } catch (e) { if (e instanceof ZodError) throw e; throw e; }
    if (key === "home") {
      const h = data as Home; const ids = [...h.hero.slides.map((s) => s.mediaId), ...h.categories.items.map((c) => c.mediaId)].filter(Boolean) as string[];
      if (ids.length) { const found = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids }, kind: "IMAGE" }, select: { id: true } }); const missing = ids.filter((i) => !found.some((f) => f.id === i)); if (missing.length) throw new AppError("MEDIA_NOT_FOUND", "A banner or category picture was deleted or isn't a picture. Choose another.", 422, { missing }); }
      const seen = new Set<string>(); for (const s of h.hero.slides) { if (seen.has(s.id)) throw new AppError("DUPLICATE_ID", "Two banners share the same id.", 422); seen.add(s.id); }
    }
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.siteContent.findUnique({ where: { key } }); const have = cur?.version ?? 0;
      if (have !== expectedVersion) throw new AppError("CONTENT_CHANGED", "Someone else changed this while you were editing. Reload to see their version, then make your change again.", 409, { currentVersion: have });
      const version = have + 1; const json = data as Prisma.InputJsonValue;
      await tx.siteContent.upsert({ where: { key }, create: { key, data: json, version, updatedBy: actor }, update: { data: json, version, updatedBy: actor } });
      await tx.siteContentRevision.create({ data: { key, version, data: json, updatedBy: actor } });
      await tx.auditLog.create({ data: { actor, action: "CONTENT_SAVED", entity: "CONTENT", entityId: key, data: { version } } });
      return { key, version };
    });
  }
  async revisions(k: string) { const key = this.key(k); return (await this.prisma.siteContentRevision.findMany({ where: { key }, orderBy: { version: "desc" }, take: 20, select: { version: true, updatedBy: true, createdAt: true } })); }
  /** Undo: makes an old version the newest one, so history is never rewritten. */
  async revert(k: string, version: number, actor: string) {
    const key = this.key(k); const rev = await this.prisma.siteContentRevision.findUnique({ where: { key_version: { key, version } } }); if (!rev) throw new AppError("NOT_FOUND", "That version doesn't exist", 404);
    const cur = await this.prisma.siteContent.findUnique({ where: { key } }); return this.save(key, rev.data, cur?.version ?? 0, actor);
  }
}
