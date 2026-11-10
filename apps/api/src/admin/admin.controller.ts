import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { InventoryService, availableOf } from "../inventory/inventory.service";
import { OrdersService } from "../orders/orders.service";
import { ReturnsService } from "../returns/returns.service";
import { BillOsService } from "../integrations/billos.service";
import { AdminGuard, MinRole } from "../common/guards";
import { AppError, parse } from "../common/http";
import { AdminService, productSchema } from "./admin.service";
import { StaffService } from "./staff.service";

const who = (r: any) => `${r.actor.name}`;

@Controller("admin/auth")
export class AdminAuthController {
  constructor(@Inject(StaffService) private staff: StaffService) {}
  @Post("login") @HttpCode(200) login(@Body() b: unknown) { const x = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), b); return this.staff.login(x.email, x.password); }
}

// Roles: STAFF (orders, returns), MANAGER (+ stock, products, store ops), OWNER (+ staff accounts). The service key counts as OWNER.
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService, @Inject(OrdersService) private orders: OrdersService, @Inject(ReturnsService) private returns: ReturnsService,
    @Inject(BillOsService) private billos: BillOsService, @Inject(AdminService) private admin: AdminService, @Inject(StaffService) private staff: StaffService) {}

  @Get("me") me(@Req() r: any) { return r.actor; }
  @Get("dashboard") dashboard() { return this.admin.dashboard(); }

  @Get("orders") orderList(@Query() q: any) { const x = parse(z.object({ status: z.string().optional(), q: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }), q); return this.admin.orderList(x); }
  @Get("orders/:number") orderDetail(@Param("number") n: string) { return this.admin.orderDetail(n); }
  @Post("orders/:number/transition") @HttpCode(200) transition(@Req() r: any, @Param("number") n: string, @Body() b: unknown) { const x = parse(z.object({ to: z.string(), pickupCode: z.string().optional() }), b); return this.orders.transition(n, x.to, `staff:${who(r)}`, x.pickupCode); }
  @Post("orders/:number/cancel") @HttpCode(200) async cancel(@Req() r: any, @Param("number") n: string) { const o = await this.prisma.order.findUnique({ where: { number: n } }); if (!o) throw new AppError("NOT_FOUND", "Order not found", 404); return this.orders.cancelOrder(o.id, `staff:${who(r)}`, "Cancelled by staff"); }
  @Post("orders/:number/refund-complete") @MinRole("MANAGER") @HttpCode(200) refund(@Req() r: any, @Param("number") n: string) { return this.admin.refundComplete(n, who(r)); }
  @Post("jobs/expire-reservations") @MinRole("MANAGER") @HttpCode(200) async expire() { return { expired: await this.orders.expireStale() }; }

  @Get("inventory") async inventory(@Query("q") q?: string) {
    const rows = await this.prisma.inventoryBalance.findMany({ where: q ? { variant: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } } : {}, include: { variant: { include: { product: true } } }, orderBy: { variant: { sku: "asc" } }, take: 500 });
    return rows.map((r) => ({ sku: r.variant.sku, product: r.variant.product.name, colour: r.variant.colourName, size: r.variant.size, onHand: r.onHand, reserved: r.reserved, safetyStock: r.safetyStock, available: availableOf(r) }));
  }
  @Post("inventory/adjustments") @MinRole("MANAGER") @HttpCode(200) async adjust(@Req() r: any, @Body() b: unknown) {
    const x = parse(z.object({ sku: z.string(), newOnHand: z.number().int().min(0), reason: z.string().min(3).max(200) }), b);
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.findUnique({ where: { sku: x.sku } }); if (!v) throw new AppError("NOT_FOUND", "SKU not found", 404);
      const loc = await this.inv.locationId(tx);
      const [bal] = await tx.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InventoryBalance" WHERE "locationId" = ${loc}::uuid AND "variantId" = ${v.id}::uuid FOR UPDATE`;
      if (!bal) throw new AppError("NOT_FOUND", "No balance row", 404);
      const delta = x.newOnHand - bal.onHand;
      if (delta === 0) return { sku: x.sku, onHand: bal.onHand, changed: false };
      const ok = await this.inv.applyPhysicalDelta(tx, { loc, variantId: v.id, delta, type: "ADJUSTMENT", key: `adjust:${randomUUID()}`, ref: x.sku, refType: "ADJUSTMENT", source: "ADMIN", actor: who(r), reason: x.reason });
      if (!ok) throw new AppError("BELOW_RESERVED", "Cannot set stock below units reserved by open orders", 409);
      await tx.auditLog.create({ data: { actor: who(r), action: "INVENTORY_ADJUST", entity: "SKU", entityId: x.sku, data: { from: bal.onHand, to: x.newOnHand, reason: x.reason } } });
      return { sku: x.sku, onHand: x.newOnHand, changed: true };
    });
  }
  @Get("inventory/movements") movements(@Query("sku") sku?: string) { return this.prisma.inventoryMovement.findMany({ where: sku ? { variant: { sku } } : {}, include: { variant: { select: { sku: true } } }, orderBy: { createdAt: "desc" }, take: 100 }); }

  @Get("products") products() { return this.admin.products(); }
  @Post("products") @MinRole("MANAGER") create(@Req() r: any, @Body() b: unknown) { return this.admin.createProduct(parse(productSchema, b), who(r)); }
  @Patch("products/:slug") @MinRole("MANAGER") update(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) {
    return this.admin.updateProduct(slug, parse(z.object({ status: z.enum(["ACTIVE", "DRAFT"]).optional(), name: z.string().min(3).max(120).optional(), description: z.string().min(10).max(2000).optional(), pricePaise: z.number().int().min(100).optional(), compareAtPaise: z.number().int().min(100).nullable().optional(), isNew: z.boolean().optional(), isBest: z.boolean().optional() }), b), who(r));
  }

  @Get("customers") customers(@Query("q") q?: string) { return this.admin.customers(q); }
  @Get("returns") returnList() { return this.prisma.returnRequest.findMany({ include: { items: { include: { orderItem: true } }, order: { select: { number: true, contactName: true, contactPhone: true } } }, orderBy: { createdAt: "desc" }, take: 100 }); }
  @Post("returns/:ref/decision") @HttpCode(200) async decide(@Req() r: any, @Param("ref") ref: string, @Body() b: unknown) {
    const d = parse(z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }), b).decision; const out = await this.returns.decide(ref, d);
    await this.prisma.auditLog.create({ data: { actor: who(r), action: `RETURN_${d}`, entity: "RETURN", entityId: ref } }); return out;
  }

  @Get("integration/status") @MinRole("MANAGER") integrationStatus() { return this.billos.status(); }
  @Post("integration/events/:eventId/retry") @MinRole("MANAGER") @HttpCode(200) retry(@Param("eventId") id: string) { return this.billos.retry(id); }
  @Get("audit") @MinRole("MANAGER") audit(@Query("limit") l?: string) { return this.admin.audit(Math.min(Number(l) || 100, 300)); }

  @Get("staff") @MinRole("OWNER") staffList() { return this.staff.list(); }
  @Post("staff") @MinRole("OWNER") staffCreate(@Req() r: any, @Body() b: unknown) { return this.staff.create(parse(z.object({ email: z.string().email(), name: z.string().min(2).max(80), password: z.string().min(12).max(100), role: z.enum(["STAFF", "MANAGER", "OWNER"]) }), b), who(r)); }
  @Patch("staff/:id") @MinRole("OWNER") staffUpdate(@Req() r: any, @Param("id") id: string, @Body() b: unknown) { return this.staff.setActive(id, parse(z.object({ isActive: z.boolean() }), b).isActive, r.actor); }
}
