import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

@Injectable()
export class CartService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService) {}

  private async cartId(userId: string) { return (await this.prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } })).id; }

  async get(userId: string) {
    const c = await this.prisma.cart.findUnique({ where: { userId }, include: { items: { include: { variant: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } } }, orderBy: { id: "asc" } } } });
    const items = c?.items ?? []; const avail = await this.inv.availability(items.map((i) => i.variantId));
    const live = items.filter((i) => i.variant.isActive && i.variant.product.status === "ACTIVE");
    return { items: live.map((i) => ({ sku: i.variant.sku, quantity: i.quantity, name: i.variant.product.name, slug: i.variant.product.slug, colour: i.variant.colourName, size: i.variant.size, pricePaise: i.variant.pricePaise, image: i.variant.product.images[0]?.url ?? null, available: avail.get(i.variantId) ?? 0 })) };
  }

  /** quantity 0 removes the line. Prices are never accepted from the client. */
  async setItem(userId: string, sku: string, quantity: number) {
    const v = await this.prisma.productVariant.findFirst({ where: { sku, isActive: true, product: { status: "ACTIVE" } } });
    if (!v) throw new AppError("INVALID_SKU", "That item is no longer available", 422);
    if (quantity > cfg().maxQtyPerLine) throw new AppError("QUANTITY_LIMIT", `Maximum ${cfg().maxQtyPerLine} per item`, 422);
    const cartId = await this.cartId(userId);
    if (quantity <= 0) await this.prisma.cartItem.deleteMany({ where: { cartId, variantId: v.id } });
    else await this.prisma.cartItem.upsert({ where: { cartId_variantId: { cartId, variantId: v.id } }, update: { quantity }, create: { cartId, variantId: v.id, quantity } });
    return this.get(userId);
  }

  /** Brings a guest bag into the account at sign-in: quantities add up (capped), unknown or retired items are skipped and reported. */
  async merge(userId: string, lines: { sku: string; quantity: number }[]) {
    const cartId = await this.cartId(userId); const skipped: string[] = [];
    const vs = await this.prisma.productVariant.findMany({ where: { sku: { in: lines.map((l) => l.sku) }, isActive: true, product: { status: "ACTIVE" } } });
    await this.prisma.$transaction(async (tx) => {
      for (const l of lines) {
        const v = vs.find((x) => x.sku === l.sku); if (!v) { skipped.push(l.sku); continue; }
        const cur = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId: v.id } } });
        const q = Math.min(cfg().maxQtyPerLine, (cur?.quantity ?? 0) + l.quantity);
        await tx.cartItem.upsert({ where: { cartId_variantId: { cartId, variantId: v.id } }, update: { quantity: q }, create: { cartId, variantId: v.id, quantity: q } });
      }
    });
    return { ...(await this.get(userId)), skipped };
  }

  async clear(userId: string) { const c = await this.prisma.cart.findUnique({ where: { userId } }); if (c) await this.prisma.cartItem.deleteMany({ where: { cartId: c.id } }); return { items: [] }; }

  // ---- wishlist ----
  async wishlist(userId: string) {
    const rows = await this.prisma.wishlistItem.findMany({ where: { userId, product: { status: "ACTIVE" } }, orderBy: { createdAt: "desc" }, include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { take: 1, orderBy: { createdAt: "asc" } } } } } });
    return rows.map((r) => ({ slug: r.product.slug, name: r.product.name, image: r.product.images[0]?.url ?? null, pricePaise: r.product.variants[0]?.pricePaise ?? 0, addedAt: r.createdAt }));
  }
  async wish(userId: string, slug: string, on: boolean) {
    const p = await this.prisma.product.findFirst({ where: { slug, status: "ACTIVE" } }); if (!p) throw new AppError("NOT_FOUND", "Product not found", 404);
    if (on) await this.prisma.wishlistItem.upsert({ where: { userId_productId: { userId, productId: p.id } }, update: {}, create: { userId, productId: p.id } });
    else await this.prisma.wishlistItem.deleteMany({ where: { userId, productId: p.id } });
    return this.wishlist(userId);
  }
}
