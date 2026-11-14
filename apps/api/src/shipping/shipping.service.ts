import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AppError } from "../common/http";
import { canMoveShipment, safeTrackingUrl, SHIPMENT_STATUSES, type ShipmentStatus } from "./shipments";

const SHIPPABLE = ["PACKED", "DISPATCHED", "OUT_FOR_DELIVERY", "DELIVERED"];

@Injectable()
export class ShippingService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async create(number: string, d: { carrier: string; awb: string; trackingUrl?: string }, actor: string) {
    const o = await this.prisma.order.findUnique({ where: { number } });
    if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    if (o.fulfilmentType === "PICKUP") throw new AppError("NOT_SHIPPABLE", "Showroom pickup orders have no courier shipment.", 409);
    if (!SHIPPABLE.includes(o.status)) throw new AppError("NOT_SHIPPABLE", "Add the courier details once the order is packed.", 409);
    const tracking = d.trackingUrl ? safeTrackingUrl(d.trackingUrl) : null;
    if (d.trackingUrl && !tracking) throw new AppError("INVALID_TRACKING_URL", "The tracking link must start with https://", 422);
    if (await this.prisma.shipment.findFirst({ where: { orderId: o.id, status: { notIn: ["FAILED", "RETURNED_TO_SELLER"] } } })) throw new AppError("SHIPMENT_EXISTS", "This order already has an active shipment.", 409);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const s = await tx.shipment.create({ data: { orderId: o.id, carrier: d.carrier, awb: d.awb.trim(), trackingUrl: tracking, createdBy: actor } });
        await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: "BOOKED", note: `${d.carrier} ${s.awb}`, actor } });
        await tx.auditLog.create({ data: { actor, action: "SHIPMENT_ADDED", entity: "ORDER", entityId: number, data: { carrier: d.carrier, awb: s.awb } } });
        return s;
      });
    } catch (e: any) { if (e?.code === "P2002") throw new AppError("AWB_IN_USE", "That tracking number is already used for another shipment.", 409); throw e; }
  }

  async setStatus(number: string, status: ShipmentStatus, note: string | undefined, actor: string) {
    if (!SHIPMENT_STATUSES.includes(status)) throw new AppError("INVALID_STATUS", "Unknown shipment status", 422);
    const o = await this.prisma.order.findUnique({ where: { number }, include: { shipments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const s = o?.shipments[0]; if (!o || !s) throw new AppError("NOT_FOUND", "This order has no shipment", 404);
    if (!canMoveShipment(s.status as ShipmentStatus, status)) throw new AppError("INVALID_TRANSITION", `A shipment that is ${s.status.toLowerCase().replace(/_/g, " ")} cannot move to ${status.toLowerCase().replace(/_/g, " ")}.`, 409);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.shipment.updateMany({ where: { id: s.id, status: s.status }, data: { status } });
      if (u.count === 0) throw new AppError("STATE_CONFLICT", "The shipment changed while you were updating it. Refresh and try again.", 409);
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status, note: note?.slice(0, 200), actor } });
    });
    return this.forOrder(o.id);
  }

  /** What the customer sees: courier, number, link, status and the dated history (no staff names). */
  async forOrder(orderId: string) {
    const s = await this.prisma.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" }, include: { events: { orderBy: { at: "asc" } } } });
    return s ? { carrier: s.carrier, awb: s.awb, trackingUrl: s.trackingUrl, status: s.status, events: s.events.map((e) => ({ status: e.status, note: e.note, at: e.at })) } : null;
  }

  async addNote(number: string, body: string, actor: string) {
    const o = await this.prisma.order.findUnique({ where: { number } }); if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    return this.prisma.orderNote.create({ data: { orderId: o.id, author: actor, body: body.trim() } });
  }
  notes(orderId: string) { return this.prisma.orderNote.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } }); }
}
