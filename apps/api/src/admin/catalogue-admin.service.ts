import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { InventoryService, availableOf } from "../inventory/inventory.service";
import { MediaService } from "../media/media.service";
import { AppError } from "../common/http";
import { sizeRank } from "../catalogue/catalogue.service";

export const mediaItems = z.array(z.object({
  mediaId: z.string().uuid().optional(), url: z.string().trim().max(500).optional(), alt: z.string().trim().max(200).default(""), posterId: z.string().uuid().nullable().optional(),
}).refine((i) => !!i.mediaId !== !!i.url, "Give either a library item or a web address")).max(12);
export const detailsSchema = z.object({
  name: z.string().trim().min(3).max(120), brand: z.string().trim().min(2).max(60), description: z.string().trim().min(10).max(2000), fabric: z.string().trim().min(2).max(120), fit: z.string().trim().min(2).max(60),
  category: z.string().trim().min(2).max(40), sortOrder: z.number().int().min(0).max(9999), isNew: z.boolean(), isBest: z.boolean(),
}).partial();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

@Injectable()
export class CatalogueAdminService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService, @Inject(MediaService) private media: MediaService) {}

  private async product(slug: string) { const p = await this.prisma.product.findUnique({ where: { slug }, include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { balances: true } } } }); if (!p) throw new AppError("NOT_FOUND", "Product not found", 404); return p; }

  /** Everything the product editor needs in one call. */
  async get(slug: string) {
    const p = await this.product(slug); const views = await this.media.viewMany(p.images.map((i) => i.mediaId).filter(Boolean) as string[]); const first = p.variants[0];
    return {
      slug: p.slug, name: p.name, brand: p.brand, description: p.description, collection: p.collection, category: p.category.name, fabric: p.fabric, fit: p.fit, status: p.status, isNew: p.isNew, isBest: p.isBest, sortOrder: p.sortOrder,
      pricePaise: first?.pricePaise ?? 0, compareAtPaise: first?.compareAtPaise ?? null, gstRateBps: p.gstRateBps, hsnCode: p.hsnCode,
      media: p.images.map((i) => { const v = i.mediaId ? views.get(i.mediaId) : undefined; return { id: i.id, kind: i.kind, alt: i.alt || v?.alt || "", mediaId: i.mediaId, posterId: i.posterId, src: v?.src ?? i.url, srcset: v?.srcset ?? [], blur: v?.blur ?? null, color: v?.color ?? null, poster: v?.poster ?? null, external: !i.mediaId }; }),
      variants: p.variants.map((v) => ({ sku: v.sku, colour: v.colourName, hex: v.colourHex, size: v.size, isActive: v.isActive, barcode: v.barcode, pricePaise: v.pricePaise, onHand: v.balances.reduce((n, b) => n + b.onHand, 0), reserved: v.balances.reduce((n, b) => n + b.reserved, 0), available: v.balances.reduce((n, b) => n + availableOf(b), 0) })),
      categories: (await this.prisma.category.findMany({ where: { collection: p.collection }, orderBy: { sortOrder: "asc" }, select: { name: true } })).map((c) => c.name),
    };
  }

  /** Name, wording, category and flags. The web address (slug) never changes, so links and bookmarks keep working. */
  async update(slug: string, d: z.infer<typeof detailsSchema>, actor: string) {
    const p = await this.product(slug); const data: Record<string, unknown> = {};
    for (const k of ["name", "brand", "description", "fabric", "fit", "sortOrder", "isNew", "isBest"] as const) if (d[k] !== undefined) data[k] = d[k];
    if (d.category !== undefined && d.category !== p.category.name) {
      const cslug = `${p.collection}-${slugify(d.category)}`; const cat = await this.prisma.category.upsert({ where: { slug: cslug }, update: {}, create: { slug: cslug, name: d.category, collection: p.collection } }); data.categoryId = cat.id;
    }
    if (!Object.keys(data).length) return this.get(slug);
    await this.prisma.$transaction([this.prisma.product.update({ where: { slug }, data }), this.prisma.auditLog.create({ data: { actor, action: "PRODUCT_DETAILS", entity: "PRODUCT", entityId: slug, data: Object.keys(data) } })]);
    return this.get(slug);
  }

  /** Publish rules: a product needs a picture, a price and a sellable size before customers can see it. */
  async setStatus(slug: string, status: "ACTIVE" | "DRAFT", actor: string) {
    const p = await this.product(slug);
    if (status === "ACTIVE") {
      const problems: string[] = []; if (!p.images.some((i) => i.kind === "IMAGE")) problems.push("add at least one picture"); if (!p.variants.some((v) => v.isActive)) problems.push("add at least one size"); if (!(p.variants[0]?.pricePaise ?? 0)) problems.push("set a price");
      if (problems.length) throw new AppError("CANNOT_PUBLISH", `Before publishing, ${problems.join(", ")}.`, 422, { problems });
    }
    await this.prisma.$transaction([this.prisma.product.update({ where: { slug }, data: { status } }), this.prisma.auditLog.create({ data: { actor, action: status === "ACTIVE" ? "PRODUCT_PUBLISH" : "PRODUCT_UNPUBLISH", entity: "PRODUCT", entityId: slug } })]);
    return this.get(slug);
  }

  /** Replaces the product's whole picture and video list in one step: add, remove and reorder all happen together or not at all. The first item is the main picture and must be a picture. */
  async setMedia(slug: string, items: z.infer<typeof mediaItems>, actor: string) {
    const p = await this.product(slug); const ids = items.flatMap((i) => [i.mediaId, i.posterId]).filter(Boolean) as string[];
    const assets = ids.length ? await this.prisma.mediaAsset.findMany({ where: { id: { in: ids } } }) : []; const byId = new Map(assets.map((a) => [a.id, a]));
    const rows = items.map((i, n) => {
      if (i.mediaId) { const a = byId.get(i.mediaId); if (!a) throw new AppError("MEDIA_NOT_FOUND", "One of the pictures was deleted. Remove it and choose another.", 422); const v = this.media.view(a);
        if (i.posterId && !(byId.get(i.posterId)?.kind === "IMAGE")) throw new AppError("INVALID_POSTER", "A video's cover must be a picture from the library.", 422);
        return { url: v.src, kind: a.kind, alt: i.alt || a.alt, mediaId: a.id, posterId: a.kind === "VIDEO" ? (i.posterId ?? a.posterId ?? null) : null, sortOrder: n }; }
      let u: URL; try { u = new URL(i.url!); } catch { throw new AppError("INVALID_URL", "That picture address isn't valid.", 422); }
      if (u.protocol !== "https:") throw new AppError("INVALID_URL", "Picture addresses must start with https://", 422);
      return { url: u.toString(), kind: "IMAGE", alt: i.alt, mediaId: null as string | null, posterId: null as string | null, sortOrder: n };
    });
    if (rows.length && rows[0]!.kind !== "IMAGE") throw new AppError("FIRST_MUST_BE_PICTURE", "The first item is the main picture and must be a picture, not a video.", 422);
    if (rows.filter((r) => r.kind === "VIDEO").length > 2) throw new AppError("TOO_MANY_VIDEOS", "A product can have up to 2 videos.", 422);
    if (p.status === "ACTIVE" && !rows.some((r) => r.kind === "IMAGE")) throw new AppError("NEEDS_PICTURE", "A published product needs at least one picture. Unpublish it first, or keep a picture.", 422);
    await this.prisma.$transaction([this.prisma.productImage.deleteMany({ where: { productId: p.id } }), this.prisma.productImage.createMany({ data: rows.map((r) => ({ ...r, productId: p.id })) }), this.prisma.auditLog.create({ data: { actor, action: "PRODUCT_MEDIA", entity: "PRODUCT", entityId: slug, data: { items: rows.length } } })]);
    return this.get(slug);
  }

  /** Adds sizes (and a colour) to an existing product. Existing combinations are left alone; one that was switched off is switched back on. Stock starts at the number given, recorded as a receipt. */
  async addVariants(slug: string, d: { colour: { name: string; hex: string }; sizes: string[]; initialStock: number }, actor: string) {
    const p = await this.product(slug); const loc = await this.inv.locationId(); const num = /^JF(\d+)-/.exec(p.variants[0]?.sku ?? "")?.[1];
    if (!num) throw new AppError("NO_BASE", "This product has no existing size to base the new codes on.", 409);
    const price = p.variants[0]!.pricePaise, compare = p.variants[0]!.compareAtPaise; let created = 0, revived = 0;
    return this.prisma.$transaction(async (tx) => {
      const same = p.variants.find((v) => v.colourName.toLowerCase() === d.colour.name.toLowerCase());
      let code = same ? same.sku.split("-")[1]! : d.colour.name.replace(/\W/g, "").slice(0, 3).toUpperCase(); const used = new Set(p.variants.map((v) => v.sku.split("-")[1]));
      if (!same) for (let i = 2; used.has(code); i++) code = d.colour.name.replace(/\W/g, "").slice(0, 2).toUpperCase() + i;
      for (const size of [...new Set(d.sizes)].sort((a, b) => sizeRank(a) - sizeRank(b))) {
        const have = p.variants.find((v) => v.colourName.toLowerCase() === d.colour.name.toLowerCase() && v.size === size);
        if (have) { if (!have.isActive) { await tx.productVariant.update({ where: { id: have.id }, data: { isActive: true } }); revived++; } continue; }
        const v = await tx.productVariant.create({ data: { productId: p.id, sku: `JF${num}-${code}-${size}`, colourName: same?.colourName ?? d.colour.name, colourHex: same?.colourHex ?? d.colour.hex, size, pricePaise: price, compareAtPaise: compare } });
        await tx.inventoryBalance.create({ data: { locationId: loc, variantId: v.id, onHand: d.initialStock } });
        if (d.initialStock > 0) await this.inv.movement(tx, { loc, variantId: v.id, type: "RECEIPT", delta: d.initialStock, key: `init:${v.id}`, ref: slug, refType: "PRODUCT_EDIT", source: "ADMIN", actor, reason: "Opening stock for added size" });
        created++;
      }
      await tx.auditLog.create({ data: { actor, action: "VARIANTS_ADDED", entity: "PRODUCT", entityId: slug, data: { created, revived, colour: d.colour.name } } });
      return { created, revived };
    });
  }
  async patchVariant(sku: string, d: { isActive?: boolean; barcode?: string | null; colourHex?: string }, actor: string) {
    const v = await this.prisma.productVariant.findUnique({ where: { sku }, include: { product: { include: { variants: true } } } }); if (!v) throw new AppError("NOT_FOUND", "Size not found", 404);
    if (d.isActive === false && v.product.status === "ACTIVE" && v.product.variants.filter((x) => x.isActive && x.id !== v.id).length === 0) throw new AppError("LAST_SIZE", "A published product needs at least one size on sale. Unpublish the product first.", 409);
    if (d.barcode) { const clash = await this.prisma.productVariant.findFirst({ where: { barcode: d.barcode, NOT: { id: v.id } } }); if (clash) throw new AppError("BARCODE_TAKEN", `That barcode already belongs to ${clash.sku}.`, 409); }
    await this.prisma.$transaction([this.prisma.productVariant.update({ where: { sku }, data: { ...(d.isActive !== undefined ? { isActive: d.isActive } : {}), ...(d.barcode !== undefined ? { barcode: d.barcode || null } : {}), ...(d.colourHex ? { colourHex: d.colourHex } : {}) } }), this.prisma.auditLog.create({ data: { actor, action: "VARIANT_UPDATE", entity: "VARIANT", entityId: sku, data: d } })]);
    return { sku, updated: true };
  }

  // ---------- categories ----------
  async categories() { const cs = await this.prisma.category.findMany({ orderBy: [{ collection: "asc" }, { sortOrder: "asc" }], include: { _count: { select: { products: true } } } }); return cs.map((c) => ({ slug: c.slug, name: c.name, collection: c.collection, sortOrder: c.sortOrder, isActive: c.isActive, imageUrl: c.imageUrl, products: c._count.products })); }
  async createCategory(d: { name: string; collection: "men" | "kids"; mediaId?: string }, actor: string) {
    const slug = `${d.collection}-${slugify(d.name)}`; if (await this.prisma.category.findUnique({ where: { slug } })) throw new AppError("CATEGORY_EXISTS", "That category already exists.", 409);
    const imageUrl = d.mediaId ? await this.picture(d.mediaId) : null; const max = await this.prisma.category.aggregate({ where: { collection: d.collection }, _max: { sortOrder: true } });
    await this.prisma.$transaction([this.prisma.category.create({ data: { slug, name: d.name, collection: d.collection, sortOrder: (max._max.sortOrder ?? 0) + 1, imageUrl } }), this.prisma.auditLog.create({ data: { actor, action: "CATEGORY_CREATE", entity: "CATEGORY", entityId: slug } })]); return { slug };
  }
  private async picture(mediaId: string) { const a = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, kind: "IMAGE" } }); if (!a) throw new AppError("MEDIA_NOT_FOUND", "That picture wasn't found.", 422); return this.media.view(a).src; }
  async updateCategory(slug: string, d: { name?: string; sortOrder?: number; isActive?: boolean; mediaId?: string | null }, actor: string) {
    const c = await this.prisma.category.findUnique({ where: { slug } }); if (!c) throw new AppError("NOT_FOUND", "Category not found", 404);
    const imageUrl = d.mediaId === undefined ? undefined : d.mediaId === null ? null : await this.picture(d.mediaId);
    await this.prisma.$transaction([this.prisma.category.update({ where: { slug }, data: { ...(d.name ? { name: d.name } : {}), ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}), ...(d.isActive !== undefined ? { isActive: d.isActive } : {}), ...(imageUrl !== undefined ? { imageUrl } : {}) } }), this.prisma.auditLog.create({ data: { actor, action: "CATEGORY_UPDATE", entity: "CATEGORY", entityId: slug, data: d } })]); return { slug, updated: true };
  }
  async deleteCategory(slug: string, actor: string) {
    const c = await this.prisma.category.findUnique({ where: { slug }, include: { _count: { select: { products: true } } } }); if (!c) throw new AppError("NOT_FOUND", "Category not found", 404);
    if (c._count.products) throw new AppError("CATEGORY_IN_USE", `${c._count.products} product(s) are in this category. Move them first, or hide the category instead.`, 409);
    await this.prisma.$transaction([this.prisma.category.delete({ where: { slug } }), this.prisma.auditLog.create({ data: { actor, action: "CATEGORY_DELETE", entity: "CATEGORY", entityId: slug } })]); return { deleted: true };
  }
}
