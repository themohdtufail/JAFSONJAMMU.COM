import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

export const returnSchema = z.object({
  orderNumber: z.string().min(4), phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), kind: z.enum(["RETURN", "EXCHANGE"]), reason: z.string().min(3).max(120), exchangeSize: z.string().max(10).optional() })).min(1).max(20),
});

@Injectable()
export class ReturnsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService) {}

  async create(userId: string | null, b: z.infer<typeof returnSchema>) {
    const o = await this.prisma.order.findUnique({ where: { number: b.orderNumber }, include: { items: true } });
    if (!o || !((userId && o.userId === userId) || (b.phone && o.contactPhone === b.phone))) throw new AppError("NOT_FOUND", "We couldn't find that order", 404);
    if (!["DELIVERED", "COLLECTED"].includes(o.status) || !o.deliveredAt) throw new AppError("NOT_ELIGIBLE", "Returns open once the order is delivered", 409);
    const days = (Date.now() - o.deliveredAt.getTime()) / 86400_000;
    if (days > cfg().returnWindowDays) throw new AppError("RETURN_WINDOW_CLOSED", `Returns are accepted within ${cfg().returnWindowDays} days of delivery`, 409);
    const open = await this.prisma.returnItem.findMany({ where: { orderItemId: { in: b.items.map((i) => i.orderItemId) }, returnReq: { status: { in: ["REQUESTED", "APPROVED"] } } } });
    if (open.length) throw new AppError("ALREADY_REQUESTED", "A return is already open for one of these items", 409);
    for (const it of b.items) {
      const oi = o.items.find((x) => x.id === it.orderItemId);
      if (!oi) throw new AppError("INVALID_ITEM", "Item does not belong to this order", 422);
      if (it.kind === "EXCHANGE") {
        if (!it.exchangeSize || it.exchangeSize === oi.size) throw new AppError("INVALID_EXCHANGE", "Choose a different size", 422);
        const target = await this.prisma.productVariant.findFirst({ where: { product: { variants: { some: { id: oi.variantId } } }, colourName: oi.colour, size: it.exchangeSize, isActive: true } });
        if (!target || (await this.inv.availability([target.id])).get(target.id)! < oi.quantity) throw new AppError("EXCHANGE_UNAVAILABLE", `Size ${it.exchangeSize} isn't available right now`, 409);
      }
    }
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('return_ref_seq') AS n`;
    const r = await this.prisma.returnRequest.create({ data: { ref: `RT${n}`, orderId: o.id, items: { create: b.items.map((i) => ({ orderItemId: i.orderItemId, kind: i.kind, reason: i.reason, exchangeSize: i.exchangeSize })) } }, include: { items: true } });
    return { ref: r.ref, status: r.status, items: r.items.length };
  }

  async list(userId: string) {
    const rs = await this.prisma.returnRequest.findMany({ where: { order: { userId } }, include: { items: { include: { orderItem: true } }, order: true }, orderBy: { createdAt: "desc" } });
    return rs.map((r) => ({ ref: r.ref, status: r.status, orderNumber: r.order.number, createdAt: r.createdAt, items: r.items.map((i) => ({ name: i.orderItem.productName, size: i.orderItem.size, kind: i.kind, reason: i.reason, exchangeSize: i.exchangeSize })) }));
  }

  async decide(ref: string, decision: "APPROVED" | "REJECTED") {
    const r = await this.prisma.returnRequest.updateMany({ where: { ref, status: "REQUESTED" }, data: { status: decision } });
    if (r.count === 0) throw new AppError("INVALID_TRANSITION", "Return not found or already decided", 409);
    return { ref, status: decision };
  }

  /** Goods are back. Resellable units return to stock (an auditable RETURN movement); damaged ones don't. */
  async receive(ref: string, restock: boolean, actor: string) {
    const r = await this.prisma.returnRequest.findUnique({ where: { ref }, include: { items: { include: { orderItem: true } } } });
    if (!r) throw new AppError("NOT_FOUND", "Return not found", 404);
    if (r.status !== "APPROVED") throw new AppError("INVALID_TRANSITION", r.status === "RECEIVED" ? "This return was already received." : "Approve the return before marking it received.", 409);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.returnRequest.updateMany({ where: { id: r.id, status: "APPROVED" }, data: { status: "RECEIVED", receivedAt: new Date(), restocked: restock } });
      if (u.count === 0) throw new AppError("INVALID_TRANSITION", "This return was just updated. Refresh and check.", 409);
      if (restock) {
        const loc = await this.inv.locationId(tx);
        for (const it of r.items) await this.inv.applyPhysicalDelta(tx, { loc, variantId: it.orderItem.variantId, delta: it.orderItem.quantity, type: "RETURN", key: `return:${r.ref}:${it.orderItemId}`, ref: r.ref, refType: "RETURN", source: "ADMIN", actor, reason: "Returned item back in sellable stock" });
      }
      await tx.auditLog.create({ data: { actor, action: restock ? "RETURN_RECEIVED_RESTOCKED" : "RETURN_RECEIVED_NOT_RESTOCKED", entity: "RETURN", entityId: ref, data: { units: r.items.reduce((n, i) => n + i.orderItem.quantity, 0) } } });
    });
    return { ref, status: "RECEIVED", restocked: restock };
  }
}
