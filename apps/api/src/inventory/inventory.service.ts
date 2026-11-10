import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, Tx } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";

export const availableOf = (b: { onHand: number; reserved: number; safetyStock: number }) => Math.max(0, b.onHand - b.reserved - b.safetyStock);

@Injectable()
export class InventoryService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async locationId(tx: Tx | PrismaService = this.prisma) {
    const l = await tx.inventoryLocation.findUnique({ where: { code: cfg().locationCode } });
    if (!l) throw new AppError("NO_LOCATION", "Inventory location not configured", 500);
    return l.id;
  }

  async availability(variantIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.inventoryBalance.findMany({ where: { variantId: { in: variantIds } } });
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.variantId, (m.get(r.variantId) ?? 0) + availableOf(r));
    return m;
  }

  /**
   * Reserve stock for an order. The guarded UPDATE only succeeds when
   * on_hand - reserved - safety >= qty, so concurrent buyers of the last unit
   * serialize on the row lock and exactly one wins. Caller supplies the transaction.
   */
  async reserve(tx: Tx, orderId: string, lines: { variantId: string; sku: string; quantity: number }[], expiresAt: Date | null) {
    const loc = await this.locationId(tx);
    for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) { // stable lock order avoids deadlocks
      const n = await tx.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" + ${l.quantity}, "version" = "version" + 1, "updatedAt" = now()
        WHERE "locationId" = ${loc}::uuid AND "variantId" = ${l.variantId}::uuid AND "onHand" - "reserved" - "safetyStock" >= ${l.quantity}`;
      if (n === 0) throw new AppError("INSUFFICIENT_STOCK", "Selected quantity is unavailable", 409, { sku: l.sku });
      await tx.inventoryReservation.create({ data: { orderId, variantId: l.variantId, locationId: loc, quantity: l.quantity, expiresAt } });
      await this.movement(tx, { loc, variantId: l.variantId, type: "RESERVE", delta: l.quantity, key: `reserve:${orderId}:${l.variantId}`, ref: orderId, refType: "ORDER", source: "COMMERCE" });
    }
  }

  async release(tx: Tx, orderId: string, reason: string) {
    const rs = await tx.inventoryReservation.findMany({ where: { orderId, status: "ACTIVE" }, orderBy: { variantId: "asc" } });
    for (const r of rs) {
      // status flip is the guard: only the transaction that flips ACTIVE->RELEASED touches the balance
      const flipped = await tx.inventoryReservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status: "RELEASED" } });
      if (flipped.count === 0) continue;
      await tx.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1, "updatedAt" = now()
        WHERE "locationId" = ${r.locationId}::uuid AND "variantId" = ${r.variantId}::uuid AND "reserved" >= ${r.quantity}`;
      await this.movement(tx, { loc: r.locationId, variantId: r.variantId, type: "RELEASE", delta: -r.quantity, key: `release:${orderId}:${r.variantId}`, ref: orderId, refType: "ORDER", source: "COMMERCE", reason });
    }
  }

  /** Goods leave the building (dispatch/collection): reserved stock becomes a physical deduction. */
  async commit(tx: Tx, orderId: string) {
    const rs = await tx.inventoryReservation.findMany({ where: { orderId, status: "ACTIVE" }, orderBy: { variantId: "asc" } });
    for (const r of rs) {
      const flipped = await tx.inventoryReservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status: "COMMITTED" } });
      if (flipped.count === 0) continue;
      const n = await tx.$executeRaw`UPDATE "InventoryBalance" SET "onHand" = "onHand" - ${r.quantity}, "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1, "updatedAt" = now()
        WHERE "locationId" = ${r.locationId}::uuid AND "variantId" = ${r.variantId}::uuid AND "reserved" >= ${r.quantity} AND "onHand" >= ${r.quantity}`;
      if (n === 0) throw new AppError("RESERVATION_CONFLICT", "Reserved stock no longer on hand", 409, { variantId: r.variantId });
      await this.movement(tx, { loc: r.locationId, variantId: r.variantId, type: "DISPATCH", delta: -r.quantity, key: `dispatch:${orderId}:${r.variantId}`, ref: orderId, refType: "ORDER", source: "COMMERCE" });
    }
  }

  /** Change physical stock by a signed delta without dropping below reserved units. Returns false if the guard rejects. */
  async applyPhysicalDelta(tx: Tx, p: { loc: string; variantId: string; delta: number; type: string; key: string; ref: string; refType: string; source: string; actor?: string; reason?: string }) {
    const n = await tx.$executeRaw`UPDATE "InventoryBalance" SET "onHand" = "onHand" + ${p.delta}, "version" = "version" + 1, "updatedAt" = now()
      WHERE "locationId" = ${p.loc}::uuid AND "variantId" = ${p.variantId}::uuid AND "onHand" + ${p.delta} >= "reserved"`;
    if (n === 0) return false;
    await this.movement(tx, { loc: p.loc, variantId: p.variantId, type: p.type, delta: p.delta, key: p.key, ref: p.ref, refType: p.refType, source: p.source, actor: p.actor, reason: p.reason });
    return true;
  }

  movement(tx: Tx, m: { loc: string; variantId: string; type: string; delta: number; key: string; ref: string; refType: string; source: string; actor?: string; reason?: string }) {
    return tx.inventoryMovement.create({ data: { locationId: m.loc, variantId: m.variantId, movementType: m.type, quantityDelta: m.delta, idempotencyKey: m.key, referenceId: m.ref, referenceType: m.refType, sourceSystem: m.source, actor: m.actor, reason: m.reason } });
  }
}
