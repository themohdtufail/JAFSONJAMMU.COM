import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { InventoryService, availableOf } from "../inventory/inventory.service";
import { OrdersService } from "../orders/orders.service";
import { ReturnsService } from "../returns/returns.service";
import { BillOsService } from "../integrations/billos.service";
import { AdminGuard } from "../common/guards";
import { AppError, parse } from "../common/http";

// NOTE: shared admin key for now. Staff accounts, RBAC and MFA (spec 9) replace this before launch.
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService, @Inject(OrdersService) private orders: OrdersService, @Inject(ReturnsService) private returns: ReturnsService, @Inject(BillOsService) private billos: BillOsService) {}

  @Get("inventory") async inventory(@Query("q") q?: string) {
    const rows = await this.prisma.inventoryBalance.findMany({ where: q ? { variant: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } } : {}, include: { variant: { include: { product: true } } }, orderBy: { variant: { sku: "asc" } }, take: 500 });
    return rows.map((r) => ({ sku: r.variant.sku, product: r.variant.product.name, colour: r.variant.colourName, size: r.variant.size, onHand: r.onHand, reserved: r.reserved, safetyStock: r.safetyStock, available: availableOf(r) }));
  }
  @Post("inventory/adjustments") @HttpCode(200) async adjust(@Body() b: unknown) {
    const x = parse(z.object({ sku: z.string(), newOnHand: z.number().int().min(0), reason: z.string().min(3).max(200) }), b);
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.findUnique({ where: { sku: x.sku } }); if (!v) throw new AppError("NOT_FOUND", "SKU not found", 404);
      const loc = await this.inv.locationId(tx);
      const [bal] = await tx.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InventoryBalance" WHERE "locationId" = ${loc}::uuid AND "variantId" = ${v.id}::uuid FOR UPDATE`;
      if (!bal) throw new AppError("NOT_FOUND", "No balance row", 404);
      const delta = x.newOnHand - bal.onHand;
      if (delta === 0) return { sku: x.sku, onHand: bal.onHand, changed: false };
      const ok = await this.inv.applyPhysicalDelta(tx, { loc, variantId: v.id, delta, type: "ADJUSTMENT", key: `adjust:${randomUUID()}`, ref: x.sku, refType: "ADJUSTMENT", source: "ADMIN", actor: "admin", reason: x.reason });
      if (!ok) throw new AppError("BELOW_RESERVED", "Cannot set stock below units reserved by open orders", 409);
      await tx.auditLog.create({ data: { actor: "admin", action: "INVENTORY_ADJUST", entity: "SKU", entityId: x.sku, data: { from: bal.onHand, to: x.newOnHand, reason: x.reason } } });
      return { sku: x.sku, onHand: x.newOnHand, changed: true };
    });
  }
  @Get("inventory/movements") movements(@Query("sku") sku?: string) { return this.prisma.inventoryMovement.findMany({ where: sku ? { variant: { sku } } : {}, include: { variant: { select: { sku: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); }

  @Get("orders") async orderList(@Query("status") status?: string) {
    const os = await this.prisma.order.findMany({ where: status ? { status } : {}, include: { items: true, history: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return os.map((o) => this.orders.view(o, false));
  }
  @Post("orders/:number/transition") @HttpCode(200) transition(@Param("number") n: string, @Body() b: unknown) { const x = parse(z.object({ to: z.string(), pickupCode: z.string().optional() }), b); return this.orders.transition(n, x.to, "admin", x.pickupCode); }
  @Post("orders/:number/cancel") @HttpCode(200) async cancel(@Param("number") n: string) { const o = await this.prisma.order.findUnique({ where: { number: n } }); if (!o) throw new AppError("NOT_FOUND", "Order not found", 404); return this.orders.cancelOrder(o.id, "admin", "Cancelled by staff"); }
  @Post("jobs/expire-reservations") @HttpCode(200) async expire() { return { expired: await this.orders.expireStale() }; }

  @Get("integration/status") integrationStatus() { return this.billos.status(); }
  @Post("integration/events/:eventId/retry") @HttpCode(200) retry(@Param("eventId") id: string) { return this.billos.retry(id); }
  @Post("returns/:ref/decision") @HttpCode(200) decide(@Param("ref") ref: string, @Body() b: unknown) { return this.returns.decide(ref, parse(z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }), b).decision); }
  @Get("returns") returnList() { return this.prisma.returnRequest.findMany({ include: { items: true, order: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 100 }); }
}
