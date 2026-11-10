import { Inject, Injectable } from "@nestjs/common";
import { billOsEventSchema } from "@jafson/validation";
import { PrismaService } from "../common/prisma.service";
import { InventoryService } from "../inventory/inventory.service";

class Quarantine extends Error { constructor(public reason: string, public detail: string) { super(reason); } }
const SIGN: Record<string, { sign: 1 | -1; type: string }> = { SALE_COMPLETED: { sign: -1, type: "SALE" }, SALE_CANCELLED: { sign: 1, type: "SALE_CANCEL" }, SALE_RETURNED: { sign: 1, type: "RETURN" }, STOCK_RECEIVED: { sign: 1, type: "RECEIPT" } };

@Injectable()
export class BillOsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService, @Inject(InventoryService) private inv: InventoryService) {}

  /** Idempotent on event_id. Never silently drops: failures land in the inbox as QUARANTINED for staff. */
  async process(raw: unknown): Promise<{ eventId: string | null; status: string; reason?: string; detail?: string }> {
    const parsed = billOsEventSchema.safeParse(raw);
    const rawId = typeof (raw as any)?.event_id === "string" ? ((raw as any).event_id as string) : null;
    if (!parsed.success) {
      if (rawId) await this.quarantine(rawId, String((raw as any)?.event_type ?? "UNKNOWN"), raw, "INVALID_SCHEMA", parsed.error.issues[0]?.message ?? "invalid");
      return { eventId: rawId, status: "QUARANTINED", reason: "INVALID_SCHEMA", detail: parsed.error.issues[0]?.message };
    }
    const ev = parsed.data;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Claim: inserts, or re-claims only a quarantined row. APPLIED/in-flight rows return nothing => duplicate.
        const claimed = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "IntegrationEventInbox" (id, "eventId", "eventType", "sourceSystem", payload, status, "receivedAt")
          VALUES (gen_random_uuid(), ${ev.event_id}, ${ev.event_type}, ${ev.source_system}, ${JSON.stringify(raw)}::jsonb, 'PROCESSING', now())
          ON CONFLICT ("eventId") DO UPDATE SET status = 'PROCESSING', attempts = "IntegrationEventInbox".attempts + 1 WHERE "IntegrationEventInbox".status = 'QUARANTINED' RETURNING id`;
        if (claimed.length === 0) return { eventId: ev.event_id, status: "DUPLICATE" };
        const loc = await tx.inventoryLocation.findUnique({ where: { code: ev.location_id } });
        if (!loc) throw new Quarantine("UNKNOWN_LOCATION", ev.location_id);
        const rows = ev.event_type === "STOCK_ADJUSTED" ? ev.event_payload.lines.map((l) => ({ sku: l.sku, d: l.quantity_delta })) : ev.event_payload.lines.map((l) => ({ sku: l.sku, d: SIGN[ev.event_type]!.sign * l.quantity }));
        const variants = await tx.productVariant.findMany({ where: { sku: { in: rows.map((r) => r.sku) } } });
        const deltas = new Map<string, number>();
        for (const r of rows) { const v = variants.find((x) => x.sku === r.sku); if (!v) throw new Quarantine("UNKNOWN_SKU", r.sku); deltas.set(v.id, (deltas.get(v.id) ?? 0) + r.d); }
        for (const [variantId, d] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
          const ok = await this.inv.applyPhysicalDelta(tx, { loc: loc.id, variantId, delta: d, type: SIGN[ev.event_type]?.type ?? "ADJUSTMENT", key: `billos:${ev.event_id}:${variantId}`, ref: ev.source_transaction_id, refType: "BILL_OS", source: ev.source_system, reason: ev.event_type === "STOCK_ADJUSTED" ? ev.event_payload.reason : undefined });
          if (!ok) throw new Quarantine("STOCK_CONFLICT", `Would drop below reserved/zero for ${variants.find((v) => v.id === variantId)?.sku}`);
        }
        await tx.integrationEventInbox.update({ where: { eventId: ev.event_id }, data: { status: "APPLIED", processedAt: new Date(), quarantineReason: null, detail: null } });
        return { eventId: ev.event_id, status: "APPLIED" };
      }, { timeout: 15000 });
    } catch (e) {
      if (e instanceof Quarantine) { await this.quarantine(ev.event_id, ev.event_type, raw, e.reason, e.detail); return { eventId: ev.event_id, status: "QUARANTINED", reason: e.reason, detail: e.detail }; }
      throw e;
    }
  }

  private quarantine(eventId: string, eventType: string, payload: unknown, reason: string, detail: string) {
    return this.prisma.integrationEventInbox.upsert({ where: { eventId }, create: { eventId, eventType, sourceSystem: "BILL_OS", payload: payload as object, status: "QUARANTINED", quarantineReason: reason, detail }, update: { status: "QUARANTINED", quarantineReason: reason, detail, attempts: { increment: 1 } } });
  }

  async snapshot(locationCode: string, lines: { sku: string; quantity: number }[]) {
    const loc = await this.prisma.inventoryLocation.findUnique({ where: { code: locationCode } });
    if (!loc) return { discrepancies: [], error: "UNKNOWN_LOCATION" };
    const vs = await this.prisma.productVariant.findMany({ where: { sku: { in: lines.map((l) => l.sku) } }, include: { balances: { where: { locationId: loc.id } } } });
    const discrepancies = lines.flatMap((l) => { const v = vs.find((x) => x.sku === l.sku); const ledger = v?.balances[0]?.onHand ?? 0; return !v || ledger !== l.quantity ? [{ sku: l.sku, ledger, reported: l.quantity, known: !!v }] : []; });
    return { checked: lines.length, discrepancies };
  }

  async status() {
    const groups = await this.prisma.integrationEventInbox.groupBy({ by: ["status"], _count: true });
    const quarantined = await this.prisma.integrationEventInbox.findMany({ where: { status: "QUARANTINED" }, orderBy: { receivedAt: "desc" }, take: 20, select: { eventId: true, eventType: true, quarantineReason: true, detail: true, attempts: true, receivedAt: true } });
    const last = await this.prisma.integrationEventInbox.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
    return { counts: Object.fromEntries(groups.map((g) => [g.status, g._count])), lastEventAt: last?.receivedAt ?? null, quarantined };
  }

  async retry(eventId: string) { const row = await this.prisma.integrationEventInbox.findUnique({ where: { eventId } }); return row ? this.process(row.payload) : { eventId, status: "NOT_FOUND" }; }
}
