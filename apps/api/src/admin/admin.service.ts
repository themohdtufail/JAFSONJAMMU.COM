import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { InventoryService, availableOf } from "../inventory/inventory.service";
import { OrdersService } from "../orders/orders.service";
import { AppError } from "../common/http";
import { sizeRank } from "../catalogue/catalogue.service";

const SALES = Prisma.sql`status NOT IN ('CANCELLED','PENDING_PAYMENT')`; // orders that count as sales
const n = (v: unknown) => Number(v ?? 0);

export const productSchema = z.object({
  name: z.string().min(3).max(120), brand: z.string().min(2).max(60), collection: z.enum(["men", "kids"]), category: z.string().min(2).max(40),
  description: z.string().min(10).max(2000), fabric: z.string().min(2).max(120), fit: z.string().min(2).max(60),
  pricePaise: z.number().int().min(100).max(100_000_00), compareAtPaise: z.number().int().min(100).nullable().optional(),
  gstRateBps: z.number().int().min(0).max(2800).default(500),
  images: z.array(z.string().url().startsWith("https://")).min(1).max(8),
  colours: z.array(z.object({ name: z.string().min(2).max(30), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(8),
  sizes: z.array(z.string().min(1).max(10)).min(1).max(12), initialStock: z.number().int().min(0).max(1000).default(0),
  isNew: z.boolean().default(false), isBest: z.boolean().default(false), status: z.enum(["ACTIVE", "DRAFT"]).default("DRAFT"),
}).refine((p) => !p.compareAtPaise || p.compareAtPaise > p.pricePaise, { message: "Compare-at price must be higher than the selling price", path: ["compareAtPaise"] });

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService, @Inject(OrdersService) private orders: OrdersService) {}

  async dashboard() {
    const p = this.prisma;
    const [today, daily, channel, collection, best, pending, low, openReturns, quarantined, unpaid, refunds] = await Promise.all([
      p.$queryRaw<any[]>`SELECT count(*)::int AS orders, coalesce(sum("totalPaise"),0)::bigint AS revenue FROM "Order" WHERE ${SALES} AND ("createdAt" AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
      p.$queryRaw<any[]>`SELECT to_char(g.d,'YYYY-MM-DD') AS day, count(o.id)::int AS orders, coalesce(sum(o."totalPaise"),0)::bigint AS revenue
        FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 13, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') AS g(d)
        LEFT JOIN "Order" o ON (o."createdAt" AT TIME ZONE 'Asia/Kolkata')::date = g.d::date AND o.status NOT IN ('CANCELLED','PENDING_PAYMENT') GROUP BY g.d ORDER BY g.d`,
      p.$queryRaw<any[]>`SELECT "fulfilmentType" AS type, count(*)::int AS orders, coalesce(sum("totalPaise"),0)::bigint AS revenue FROM "Order" WHERE ${SALES} AND "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 3 DESC`,
      p.$queryRaw<any[]>`SELECT pr.collection, coalesce(sum(oi."lineTotalPaise"),0)::bigint AS revenue, coalesce(sum(oi.quantity),0)::int AS units FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" JOIN "ProductVariant" v ON v.id = oi."variantId" JOIN "Product" pr ON pr.id = v."productId"
        WHERE o.status NOT IN ('CANCELLED','PENDING_PAYMENT') AND o."createdAt" > now() - interval '30 days' GROUP BY 1`,
      p.$queryRaw<any[]>`SELECT oi."productName" AS name, sum(oi.quantity)::int AS units, sum(oi."lineTotalPaise")::bigint AS revenue FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" WHERE o.status NOT IN ('CANCELLED','PENDING_PAYMENT') AND o."createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 5`,
      p.order.groupBy({ by: ["status"], where: { status: { in: ["CONFIRMED", "PICKING", "PACKED", "READY_FOR_PICKUP", "DISPATCHED"] } }, _count: true }),
      p.inventoryBalance.findMany({ where: { variant: { isActive: true, product: { status: "ACTIVE" } } }, include: { variant: { include: { product: true } } } }),
      p.returnRequest.count({ where: { status: "REQUESTED" } }),
      p.integrationEventInbox.count({ where: { status: "QUARANTINED" } }),
      p.order.count({ where: { status: "PENDING_PAYMENT" } }),
      p.order.count({ where: { paymentStatus: { in: ["REFUND_PENDING", "REFUND_DUE"] } } }),
    ]);
    const t = today[0]; const orders = n(t.orders), revenue = n(t.revenue);
    const month = daily.reduce((a, d) => ({ o: a.o + n(d.orders), r: a.r + n(d.revenue) }), { o: 0, r: 0 });
    return {
      today: { orders, revenuePaise: revenue, aovPaise: orders ? Math.round(revenue / orders) : 0 },
      last14Days: { orders: month.o, revenuePaise: month.r, aovPaise: month.o ? Math.round(month.r / month.o) : 0 },
      daily: daily.map((d) => ({ day: d.day, orders: n(d.orders), revenuePaise: n(d.revenue) })),
      channels: channel.map((c) => ({ type: c.type, orders: n(c.orders), revenuePaise: n(c.revenue) })),
      collections: collection.map((c) => ({ collection: c.collection, revenuePaise: n(c.revenue), units: n(c.units) })),
      bestsellers: best.map((b) => ({ name: b.name, units: n(b.units), revenuePaise: n(b.revenue) })),
      pendingFulfilment: Object.fromEntries(pending.map((x) => [x.status, x._count])),
      lowStock: low.map((b) => ({ sku: b.variant.sku, product: b.variant.product.name, colour: b.variant.colourName, size: b.variant.size, available: availableOf(b), onHand: b.onHand })).filter((b) => b.available <= 3).sort((a, b) => a.available - b.available).slice(0, 12),
      attention: { openReturns, quarantinedEvents: quarantined, unpaidOrders: unpaid, refundsToProcess: refunds },
    };
  }

  async orderList(q: { status?: string; q?: string; limit: number; offset: number }) {
    const where: Prisma.OrderWhereInput = {};
    if (q.status) where.status = q.status.includes(",") ? { in: q.status.split(",") } : q.status;
    if (q.q) { const t = q.q.trim(); where.OR = [{ number: { contains: t, mode: "insensitive" } }, { contactPhone: { contains: t } }, { contactName: { contains: t, mode: "insensitive" } }]; }
    const [total, rows] = await Promise.all([this.prisma.order.count({ where }), this.prisma.order.findMany({ where, include: { items: true, history: true }, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset })]);
    return { total, items: rows.map((o) => this.orders.view(o, false)) };
  }
  async orderDetail(number: string) {
    const o = await this.prisma.order.findUnique({ where: { number }, include: { items: true, history: { orderBy: { createdAt: "asc" } }, payments: { include: { refunds: true } }, returns: { include: { items: true } } } });
    if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    return { ...this.orders.view(o, false), history: o.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, actor: h.actor, note: h.note, at: h.createdAt })), payments: o.payments.map((p) => ({ provider: p.provider, ref: p.providerRef, providerPaymentId: p.providerPaymentId, method: p.method, amountPaise: p.amountPaise, status: p.status, at: p.createdAt, refunds: p.refunds.map((r) => ({ id: r.providerRefundId, amountPaise: r.amountPaise, status: r.status, at: r.createdAt })) })), returns: o.returns.map((r) => ({ ref: r.ref, status: r.status })), pickupCode: o.pickupCode };
  }
  async refundComplete(number: string, actor: string) {
    const r = await this.prisma.order.updateMany({ where: { number, paymentStatus: { in: ["REFUND_PENDING", "REFUND_DUE"] } }, data: { paymentStatus: "REFUNDED" } });
    if (r.count === 0) throw new AppError("NOT_REFUNDABLE", "No refund is pending on this order", 409);
    await this.prisma.auditLog.create({ data: { actor, action: "REFUND_MARKED_COMPLETE", entity: "ORDER", entityId: number, data: { note: "Refunded manually outside the system" } } });
    return this.orderDetail(number);
  }

  async products() {
    const ps = await this.prisma.product.findMany({ include: { category: true, images: { orderBy: { sortOrder: "asc" }, take: 1 }, variants: { include: { balances: true } } }, orderBy: [{ createdAt: "desc" }] });
    return ps.map((p) => ({ slug: p.slug, name: p.name, brand: p.brand, collection: p.collection, category: p.category.name, status: p.status, isNew: p.isNew, isBest: p.isBest, image: p.images[0]?.url ?? null, pricePaise: p.variants[0]?.pricePaise ?? 0, compareAtPaise: p.variants[0]?.compareAtPaise ?? null, variants: p.variants.length,
      available: p.variants.reduce((s, v) => s + v.balances.reduce((a, b) => a + availableOf(b), 0), 0), description: p.description }));
  }
  async updateProduct(slug: string, d: { status?: string; name?: string; description?: string; pricePaise?: number; compareAtPaise?: number | null; isNew?: boolean; isBest?: boolean }, actor: string) {
    const p = await this.prisma.product.findUnique({ where: { slug }, include: { variants: { take: 1 } } });
    if (!p) throw new AppError("NOT_FOUND", "Product not found", 404);
    const price = d.pricePaise ?? p.variants[0]?.pricePaise ?? 0; const cmp = d.compareAtPaise === undefined ? p.variants[0]?.compareAtPaise : d.compareAtPaise;
    if (cmp && cmp <= price) throw new AppError("INVALID_PRICE", "Compare-at price must be higher than the selling price", 422);
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { slug }, data: { status: d.status, name: d.name, description: d.description, isNew: d.isNew, isBest: d.isBest } });
      if (d.pricePaise !== undefined || d.compareAtPaise !== undefined) await tx.productVariant.updateMany({ where: { productId: p.id }, data: { ...(d.pricePaise !== undefined ? { pricePaise: d.pricePaise } : {}), ...(d.compareAtPaise !== undefined ? { compareAtPaise: d.compareAtPaise } : {}) } });
      await tx.auditLog.create({ data: { actor, action: "PRODUCT_UPDATE", entity: "PRODUCT", entityId: slug, data: d as Prisma.InputJsonValue } });
    });
    return { slug, updated: true };
  }
  async createProduct(d: z.infer<typeof productSchema>, actor: string) {
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (await this.prisma.product.findUnique({ where: { slug } })) throw new AppError("SLUG_TAKEN", "A product with a similar name already exists", 409);
    const loc = await this.inv.locationId();
    return this.prisma.$transaction(async (tx) => {
      const cslug = `${d.collection}-${d.category}`.toLowerCase().replace(/[^a-z]+/g, "-");
      const cat = await tx.category.upsert({ where: { slug: cslug }, update: {}, create: { slug: cslug, name: d.category, collection: d.collection } });
      const [{ v }] = await tx.$queryRaw<{ v: bigint }[]>`SELECT nextval('product_sku_seq') AS v`;
      const prod = await tx.product.create({ data: { slug, name: d.name, brand: d.brand.trim(), description: d.description, collection: d.collection, categoryId: cat.id, fabric: d.fabric, fit: d.fit, gstRateBps: d.gstRateBps, status: d.status, isNew: d.isNew, isBest: d.isBest, images: { create: d.images.map((url, i) => ({ url, sortOrder: i })) } } });
      const codes = new Set<string>(); let count = 0;
      for (const c of d.colours) {
        let code = c.name.replace(/\W/g, "").slice(0, 3).toUpperCase(); for (let i = 2; codes.has(code); i++) code = c.name.replace(/\W/g, "").slice(0, 2).toUpperCase() + i; codes.add(code);
        for (const size of [...new Set(d.sizes)].sort((a, b) => sizeRank(a) - sizeRank(b))) {
          const variant = await tx.productVariant.create({ data: { productId: prod.id, sku: `JF${v}-${code}-${size}`, colourName: c.name, colourHex: c.hex, size, pricePaise: d.pricePaise, compareAtPaise: d.compareAtPaise ?? null } });
          await tx.inventoryBalance.create({ data: { locationId: loc, variantId: variant.id, onHand: d.initialStock } });
          if (d.initialStock > 0) await this.inv.movement(tx, { loc, variantId: variant.id, type: "RECEIPT", delta: d.initialStock, key: `init:${variant.id}`, ref: slug, refType: "PRODUCT_CREATE", source: "ADMIN", actor, reason: "Opening stock" });
          count++;
        }
      }
      await tx.auditLog.create({ data: { actor, action: "PRODUCT_CREATE", entity: "PRODUCT", entityId: slug, data: { variants: count, status: d.status } } });
      return { slug, variants: count, status: d.status };
    });
  }

  async customers(q?: string) {
    const users = await this.prisma.user.findMany({ where: q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    const agg = await this.prisma.order.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _count: true, _sum: { totalPaise: true }, _max: { createdAt: true } });
    return users.map((u) => { const a = agg.find((x) => x.userId === u.id); return { id: u.id, name: u.name, phone: u.phone, status: u.status, joinedAt: u.createdAt, orders: a?._count ?? 0, spentPaise: a?._sum.totalPaise ?? 0, lastOrderAt: a?._max.createdAt ?? null }; });
  }
  audit(limit: number) { return this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit }); }
}
