import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { AppError } from "../common/http";

const include = { category: true, images: { orderBy: { sortOrder: "asc" as const } }, variants: { where: { isActive: true }, orderBy: [{ colourName: "asc" as const }, { size: "asc" as const }] } };
type P = Prisma.ProductGetPayload<{ include: typeof include }>;

export const stockStatus = (n: number) => (n <= 0 ? "OUT_OF_STOCK" : n <= 3 ? "LOW_STOCK" : "IN_STOCK");

@Injectable()
export class CatalogueService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService) {}

  private async dto(products: P[]) {
    const avail = await this.inv.availability(products.flatMap((p) => p.variants.map((v) => v.id)));
    return products.map((p) => {
      const variants = p.variants.map((v) => { const a = avail.get(v.id) ?? 0; return { sku: v.sku, colour: v.colourName, size: v.size, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, available: Math.min(a, 10), stockStatus: stockStatus(a) }; });
      const colours = [...new Map(p.variants.map((v) => [v.colourName, { name: v.colourName, hex: v.colourHex }])).values()];
      const sizes = [...new Set(p.variants.map((v) => v.size))];
      const first = p.variants[0];
      return { slug: p.slug, name: p.name, description: p.description, collection: p.collection, category: p.category.name, fabric: p.fabric, fit: p.fit,
        pricePaise: first?.pricePaise ?? 0, compareAtPaise: first?.compareAtPaise ?? null, images: p.images.map((i) => i.url), colours, sizes, variants,
        isNew: p.isNew, isBest: p.isBest, inStock: variants.some((v) => v.available > 0) };
    });
  }

  async list(q: { collection?: string; category?: string; filter?: string; sort?: string; q?: string; limit?: number }) {
    const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
    if (q.collection) where.collection = q.collection;
    if (q.category) where.category = { name: q.category };
    if (q.filter === "new") where.isNew = true;
    if (q.filter === "best") where.isBest = true;
    if (q.q) { const t = q.q.trim(); where.OR = [{ name: { contains: t, mode: "insensitive" } }, { category: { name: { contains: t, mode: "insensitive" } } }, { collection: { contains: t, mode: "insensitive" } }, { variants: { some: { colourName: { contains: t, mode: "insensitive" } } } }]; }
    const rows = await this.prisma.product.findMany({ where, include, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: Math.min(q.limit ?? 60, 100) });
    let out = await this.dto(rows);
    if (q.filter === "sale") out = out.filter((p) => p.compareAtPaise);
    if (q.sort === "low") out.sort((a, b) => a.pricePaise - b.pricePaise);
    if (q.sort === "high") out.sort((a, b) => b.pricePaise - a.pricePaise);
    if (q.sort === "new") out.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    return out;
  }

  async bySlug(slug: string) {
    const p = await this.prisma.product.findFirst({ where: { slug, status: "ACTIVE" }, include });
    if (!p) throw new AppError("NOT_FOUND", "Product not found", 404);
    const [dto] = await this.dto([p]);
    const related = await this.list({ collection: p.collection, limit: 5 });
    return { ...dto!, related: related.filter((r) => r.slug !== slug).slice(0, 4) };
  }

  async categories() {
    const cs = await this.prisma.category.findMany({ orderBy: [{ collection: "asc" }, { sortOrder: "asc" }] });
    return cs.map((c) => ({ slug: c.slug, name: c.name, collection: c.collection }));
  }

  sizeGuides() {
    return {
      men: { columns: ["Size", "Chest", "Waist", "Shoulder", "Length"], unit: "cm", rows: [["S", 92, 78, 43, 68], ["M", 98, 84, 45, 70], ["L", 104, 90, 47, 72], ["XL", 110, 96, 49, 74], ["XXL", 116, 102, 51, 76]] },
      kids: { columns: ["Size", "Age", "Height", "Chest", "Waist"], unit: "cm", rows: [["2-3Y", "2–3 yrs", 98, 54, 52], ["4-5Y", "4–5 yrs", 110, 58, 54], ["6-7Y", "6–7 yrs", 122, 63, 56], ["8-9Y", "8–9 yrs", 134, 68, 59], ["10-11Y", "10–11 yrs", 146, 74, 62]] },
    };
  }
}
