import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService, Tx } from "../common/prisma.service";
import { AppError } from "../common/http";
import { cfg } from "../common/config";
import { buildCreditLines, buildInvoiceLines, documentNumber, financialYear, amountInWords, stateName, supplyType, totalsOf, validGstin, type DocLine } from "./gst";

const csv = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rs = (p: number) => (p / 100).toFixed(2);

@Injectable()
export class GstService {
  private log = new Logger("GST");
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /** True once the company has entered its GSTIN: from then on shipped orders get a tax invoice. */
  get taxMode() { return !!cfg().seller.gstin; }

  private seller() {
    const s = cfg().seller;
    if (!validGstin(s.gstin)) throw new AppError("SELLER_GSTIN_INVALID", "The seller GSTIN is missing or invalid, so tax invoices cannot be issued.", 409);
    if (!s.address.trim()) throw new AppError("SELLER_ADDRESS_MISSING", "The seller's registered address is not set (SELLER_ADDRESS), so tax invoices cannot be issued.", 409);
    return { name: s.legalName, gstin: s.gstin.toUpperCase(), address: s.address, stateCode: s.gstin.slice(0, 2) };
  }

  /** Next gapless number for a document type and financial year. The row lock is held until the surrounding transaction ends, so a rollback gives the number back. */
  private async nextNumber(tx: Tx, kind: "INV" | "CN", fy: string) {
    const key = `${kind}:${fy}`;
    const [row] = await tx.$queryRaw<{ next: number }[]>`INSERT INTO "DocumentSequence" ("key", "next") VALUES (${key}, 2) ON CONFLICT ("key") DO UPDATE SET "next" = "DocumentSequence"."next" + 1 RETURNING "next" - 1 AS next`;
    return documentNumber(kind === "INV" ? "JF" : "CN", fy, Number(row!.next));
  }

  /** Issues the invoice for an order (idempotent). Runs inside the caller's transaction so a failure blocks the dispatch rather than shipping without a tax invoice. */
  async issueInvoice(tx: Tx, orderId: string, actor: string) {
    const existing = await tx.invoice.findUnique({ where: { orderId } });
    if (existing) return existing;
    const seller = this.seller();
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } } } });
    const missing = o.items.filter((i) => !i.hsnCode);
    if (missing.length) throw new AppError("HSN_MISSING", `Add an HSN code to ${[...new Set(missing.map((i) => i.productName))].join(", ")} before this order can be invoiced.`, 409, { skus: missing.map((i) => i.sku) });
    const supply = supplyType(seller.stateCode, o.placeOfSupplyCode);
    const lines = buildInvoiceLines(o.items.map((i) => ({ orderItemId: i.id, sku: i.sku, name: i.productName, variant: `${i.colour} / ${i.size}`, hsn: i.hsnCode!, quantity: i.quantity, unitPricePaise: i.unitPricePaise, rateBps: i.gstRateBps })), o.shippingPaise, o.codFeePaise, supply);
    const t = totalsOf(lines);
    if (t.grossPaise !== o.totalPaise) throw new AppError("INVOICE_TOTAL_MISMATCH", "Invoice lines do not add up to the order total. Nothing was issued.", 500);
    const now = new Date(), fy = financialYear(now);
    const number = await this.nextNumber(tx, "INV", fy);
    const inv = await tx.invoice.create({ data: { number, financialYear: fy, orderId, issuedAt: now, issuedBy: actor, sellerName: seller.name, sellerGstin: seller.gstin, sellerAddress: seller.address, sellerStateCode: seller.stateCode, buyerName: o.contactName, buyerGstin: o.buyerGstin, buyerBusinessName: o.buyerBusinessName, billingAddress: o.shippingAddress as Prisma.InputJsonValue, placeOfSupplyCode: o.placeOfSupplyCode, supply, lines: lines as unknown as Prisma.InputJsonValue, taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, totalPaise: t.grossPaise } });
    await tx.auditLog.create({ data: { actor, action: "INVOICE_ISSUED", entity: "ORDER", entityId: o.number, data: { number, totalPaise: t.grossPaise } } });
    return inv;
  }

  /** Issues a credit note against the order's invoice for a refund. No invoice means nothing was ever invoiced, so there is nothing to credit. */
  async issueCreditNote(orderId: string, o: { actor: string; reason?: string; amountPaise?: number | null; refundId?: string | null; itemIds?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { orderId } });
      if (!inv) return null;
      if (o.refundId) { const dup = await tx.creditNote.findUnique({ where: { refundId: o.refundId } }); if (dup) return dup; }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${inv.id}))`; // credit notes for one invoice are issued one at a time
      const prior = await tx.creditNote.findMany({ where: { invoiceId: inv.id } });
      const lines = buildCreditLines(inv.lines as unknown as DocLine[], prior.flatMap((c) => c.lines as unknown as DocLine[]), inv.supply as "INTRA" | "INTER", o.amountPaise ?? null, o.itemIds);
      const t = totalsOf(lines), now = new Date(), fy = financialYear(now);
      const number = await this.nextNumber(tx, "CN", fy);
      const cn = await tx.creditNote.create({ data: { number, financialYear: fy, invoiceId: inv.id, orderId, refundId: o.refundId ?? null, reason: o.reason?.slice(0, 200) || "Refund", issuedAt: now, issuedBy: o.actor, lines: lines as unknown as Prisma.InputJsonValue, taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, totalPaise: t.grossPaise } });
      await tx.auditLog.create({ data: { actor: o.actor, action: "CREDIT_NOTE_ISSUED", entity: "ORDER", entityId: inv.number, data: { number, totalPaise: t.grossPaise } } });
      return cn;
    }, { maxWait: 5000, timeout: 15000 });
  }

  /** Never lets a bookkeeping problem hide a refund that already happened: logs and carries on, so staff can issue the note by hand. */
  async creditNoteForRefund(orderId: string, o: Parameters<GstService["issueCreditNote"]>[1]) {
    try { return await this.issueCreditNote(orderId, o); } catch (e) { this.log.error(`CREDIT NOTE NOT ISSUED order=${orderId} refund=${o.refundId ?? "-"}: ${(e as Error).message}`); return null; }
  }

  async documentsFor(orderId: string) {
    const [invoice, creditNotes] = await Promise.all([this.prisma.invoice.findUnique({ where: { orderId } }), this.prisma.creditNote.findMany({ where: { orderId }, orderBy: { issuedAt: "asc" } })]);
    return { invoice: invoice ? this.invoiceView(invoice) : null, creditNotes: creditNotes.map((c) => this.creditView(c)) };
  }
  invoiceView(i: Prisma.InvoiceGetPayload<object>) { return { ...i, placeOfSupply: stateName(i.placeOfSupplyCode), sellerState: stateName(i.sellerStateCode), totalInWords: amountInWords(i.totalPaise) }; }
  creditView(c: Prisma.CreditNoteGetPayload<object>) { return { ...c, totalInWords: amountInWords(c.totalPaise) }; }

  /** Admin: full detail of one document by number, with the invoice it belongs to. */
  async creditNoteByNumber(number: string) { return this.prisma.creditNote.findUnique({ where: { number }, include: { invoice: true } }); }

  /** Month or date-range summary for the return (GSTR-1 style): totals by rate and supply, then document lists. */
  async summary(from: Date, to: Date) {
    const [invoices, notes] = await Promise.all([
      this.prisma.invoice.findMany({ where: { issuedAt: { gte: from, lt: to } }, orderBy: { number: "asc" } }),
      this.prisma.creditNote.findMany({ where: { issuedAt: { gte: from, lt: to } }, include: { invoice: { select: { number: true, supply: true } } }, orderBy: { number: "asc" } }),
    ]);
    type Row = { rateBps: number; supply: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
    const by = new Map<string, Row>();
    const add = (lines: DocLine[], supply: string, sign: 1 | -1) => { for (const l of lines) { const k = `${l.rateBps}|${supply}`; const r = by.get(k) ?? { rateBps: l.rateBps, supply, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }; r.taxablePaise += sign * l.taxablePaise; r.cgstPaise += sign * l.cgstPaise; r.sgstPaise += sign * l.sgstPaise; r.igstPaise += sign * l.igstPaise; by.set(k, r); } };
    for (const i of invoices) add(i.lines as unknown as DocLine[], i.supply, 1);
    for (const c of notes) add(c.lines as unknown as DocLine[], c.invoice.supply, -1);
    const rows = [...by.values()].sort((a, b) => a.rateBps - b.rateBps || a.supply.localeCompare(b.supply));
    const sum = (k: keyof Row) => rows.reduce((n, r) => n + (r[k] as number), 0);
    return {
      from, to, invoiceCount: invoices.length, creditNoteCount: notes.length,
      invoicedPaise: invoices.reduce((n, i) => n + i.totalPaise, 0), creditedPaise: notes.reduce((n, c) => n + c.totalPaise, 0),
      byRate: rows, net: { taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise") },
      invoices: invoices.map((i) => ({ number: i.number, issuedAt: i.issuedAt, buyer: i.buyerBusinessName || i.buyerName, buyerGstin: i.buyerGstin, placeOfSupply: i.placeOfSupplyCode, supply: i.supply, taxablePaise: i.taxablePaise, cgstPaise: i.cgstPaise, sgstPaise: i.sgstPaise, igstPaise: i.igstPaise, totalPaise: i.totalPaise })),
      creditNotes: notes.map((c) => ({ number: c.number, issuedAt: c.issuedAt, invoice: c.invoice.number, reason: c.reason, taxablePaise: c.taxablePaise, cgstPaise: c.cgstPaise, sgstPaise: c.sgstPaise, igstPaise: c.igstPaise, totalPaise: c.totalPaise })),
    };
  }

  async summaryCsv(from: Date, to: Date) {
    const s = await this.summary(from, to);
    const head = "Document,Number,Date,Against invoice,Buyer,Buyer GSTIN,Place of supply,Supply,Taxable (INR),CGST,SGST,IGST,Total (INR)";
    const d = (x: Date) => new Date(x.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const inv = s.invoices.map((i) => ["Invoice", i.number, d(i.issuedAt), "", i.buyer, i.buyerGstin ?? "", `${i.placeOfSupply}-${stateName(i.placeOfSupply) ?? ""}`, i.supply, rs(i.taxablePaise), rs(i.cgstPaise), rs(i.sgstPaise), rs(i.igstPaise), rs(i.totalPaise)]);
    const cn = s.creditNotes.map((c) => ["Credit note", c.number, d(c.issuedAt), c.invoice, "", "", "", "", rs(-c.taxablePaise), rs(-c.cgstPaise), rs(-c.sgstPaise), rs(-c.igstPaise), rs(-c.totalPaise)]);
    return [head, ...[...inv, ...cn].map((r) => r.map(csv).join(","))].join("\r\n") + "\r\n";
  }
}
