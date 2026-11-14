import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

export interface Check { name: string; ok: boolean; checked: number; problems: string[] }

/**
 * Read-only consistency checks across the ledger, orders, payments, refunds and tax documents (spec release gates: inventory and payment reconciliation).
 * Nothing is changed; each check lists what disagrees so a person can decide. Run it before launch and then regularly (`pnpm --filter @jafson/api integrity`).
 */
@Injectable()
export class IntegrityService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  private async check(name: string, count: Promise<{ n: bigint | number }[]>, bad: Promise<{ msg: string }[]>): Promise<Check> {
    const [c, b] = await Promise.all([count, bad]);
    return { name, ok: b.length === 0, checked: Number(c[0]?.n ?? 0), problems: b.slice(0, 50).map((x) => x.msg) };
  }

  async run(): Promise<{ ok: boolean; at: string; checks: Check[] }> {
    const q = this.prisma;
    const checks = await Promise.all([
      this.check("Reserved stock equals the active reservations, per variant",
        q.$queryRaw`SELECT count(*) AS n FROM "InventoryBalance"`,
        q.$queryRaw`SELECT 'variant ' || v.sku || ': ledger says ' || b.reserved || ' reserved, active reservations total ' || COALESCE(r.q, 0) AS msg FROM "InventoryBalance" b JOIN "ProductVariant" v ON v.id = b."variantId"
          LEFT JOIN (SELECT "variantId", "locationId", sum(quantity) q FROM "InventoryReservation" WHERE status = 'ACTIVE' GROUP BY 1, 2) r ON r."variantId" = b."variantId" AND r."locationId" = b."locationId" WHERE b.reserved <> COALESCE(r.q, 0)`),
      this.check("No stock balance is negative or more reserved than held",
        q.$queryRaw`SELECT count(*) AS n FROM "InventoryBalance"`,
        q.$queryRaw`SELECT 'variant ' || v.sku || ': on hand ' || b."onHand" || ', reserved ' || b.reserved AS msg FROM "InventoryBalance" b JOIN "ProductVariant" v ON v.id = b."variantId" WHERE b."onHand" < 0 OR b.reserved < 0 OR b.reserved > b."onHand"`),
      this.check("Every dispatched or collected order has its stock deducted (no reservation left active)",
        q.$queryRaw`SELECT count(*) AS n FROM "Order" WHERE status IN ('DISPATCHED','OUT_FOR_DELIVERY','DELIVERED','COLLECTED')`,
        q.$queryRaw`SELECT 'order ' || o.number || ' is ' || o.status || ' but still holds reserved stock' AS msg FROM "Order" o JOIN "InventoryReservation" r ON r."orderId" = o.id WHERE r.status = 'ACTIVE' AND o.status IN ('DISPATCHED','OUT_FOR_DELIVERY','DELIVERED','COLLECTED')`),
      this.check("Cancelled orders hold no reserved stock",
        q.$queryRaw`SELECT count(*) AS n FROM "Order" WHERE status = 'CANCELLED'`,
        q.$queryRaw`SELECT 'order ' || o.number || ' is cancelled but still holds reserved stock' AS msg FROM "Order" o JOIN "InventoryReservation" r ON r."orderId" = o.id WHERE r.status = 'ACTIVE' AND o.status = 'CANCELLED'`),
      this.check("Order totals add up (items + delivery + COD fee) and lines add up to the subtotal",
        q.$queryRaw`SELECT count(*) AS n FROM "Order"`,
        q.$queryRaw`SELECT 'order ' || o.number || ': ' || CASE WHEN o."totalPaise" <> o."subtotalPaise" + o."shippingPaise" + o."codFeePaise" THEN 'total does not equal items + fees' ELSE 'lines total ' || s.t || ' but subtotal is ' || o."subtotalPaise" END AS msg
          FROM "Order" o JOIN (SELECT "orderId", sum("lineTotalPaise") t FROM "OrderItem" GROUP BY 1) s ON s."orderId" = o.id WHERE o."totalPaise" <> o."subtotalPaise" + o."shippingPaise" + o."codFeePaise" OR s.t <> o."subtotalPaise"`),
      this.check("A captured online payment matches its order total, and every paid online order has one",
        q.$queryRaw`SELECT count(*) AS n FROM "Payment" WHERE status = 'CAPTURED'`,
        q.$queryRaw`SELECT 'order ' || o.number || ': captured ' || p."amountPaise" || ' but order total is ' || o."totalPaise" AS msg FROM "Payment" p JOIN "Order" o ON o.id = p."orderId" WHERE p.status = 'CAPTURED' AND p."amountPaise" <> o."totalPaise"
          UNION ALL SELECT 'order ' || o.number || ' is marked paid but has no captured payment' FROM "Order" o WHERE o."paymentStatus" = 'PAID' AND o."paymentMethod" <> 'COD' AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id AND p.status = 'CAPTURED')`),
      this.check("Refunds never exceed what was captured",
        q.$queryRaw`SELECT count(*) AS n FROM "Payment" WHERE status = 'CAPTURED'`,
        q.$queryRaw`SELECT 'order ' || o.number || ': refunds ' || r.t || ' exceed captured ' || p."amountPaise" AS msg FROM "Payment" p JOIN "Order" o ON o.id = p."orderId" JOIN (SELECT "paymentId", sum("amountPaise") t FROM "Refund" WHERE status IN ('PENDING','PROCESSED') GROUP BY 1) r ON r."paymentId" = p.id WHERE r.t > p."amountPaise"`),
      this.check("Each invoice equals its order total, and its tax splits add up",
        q.$queryRaw`SELECT count(*) AS n FROM "Invoice"`,
        q.$queryRaw`SELECT 'invoice ' || i.number || ': ' || CASE WHEN i."totalPaise" <> o."totalPaise" THEN 'total ' || i."totalPaise" || ' differs from order ' || o."totalPaise" ELSE 'taxable plus tax does not equal total' END AS msg FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId"
          WHERE i."totalPaise" <> o."totalPaise" OR i."taxablePaise" + i."cgstPaise" + i."sgstPaise" + i."igstPaise" <> i."totalPaise"`),
      this.check("Credit notes never exceed their invoice",
        q.$queryRaw`SELECT count(*) AS n FROM "CreditNote"`,
        q.$queryRaw`SELECT 'invoice ' || i.number || ': credit notes total ' || c.t || ' exceed invoice ' || i."totalPaise" AS msg FROM "Invoice" i JOIN (SELECT "invoiceId", sum("totalPaise") t FROM "CreditNote" GROUP BY 1) c ON c."invoiceId" = i.id WHERE c.t > i."totalPaise"`),
      this.check("Invoice and credit note numbers run without gaps within each series and year",
        q.$queryRaw`SELECT count(*) AS n FROM "Invoice"`,
        q.$queryRaw`WITH n AS (SELECT 'invoice' k, "financialYear" fy, split_part(number, '/', 3)::int s FROM "Invoice" UNION ALL SELECT 'credit note', "financialYear", split_part(number, '/', 3)::int FROM "CreditNote"),
          g AS (SELECT k, fy, count(*) c, max(s) m FROM n GROUP BY 1, 2) SELECT g.k || ' series ' || g.fy || ': ' || g.c || ' documents but highest number is ' || g.m AS msg FROM g WHERE g.c <> g.m`),
      this.check("No customer message is stuck (pending for over an hour or failed)",
        q.$queryRaw`SELECT count(*) AS n FROM "Notification"`,
        q.$queryRaw`SELECT n.channel || ' ' || n.template || ': ' || n.status || ', ' || n.attempts || ' tries' AS msg FROM "Notification" n WHERE n.status = 'FAILED' OR (n.status = 'PENDING' AND n."createdAt" < now() - interval '1 hour')`),
    ]);
    return { ok: checks.every((c) => c.ok), at: new Date().toISOString(), checks };
  }
}
