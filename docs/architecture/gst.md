# GST invoices and credit notes

How the platform issues tax documents, and what a chartered accountant must confirm before the first real invoice goes out.
This is an engineering description, not tax advice.

## When a document is issued

| Event | Document |
| --- | --- |
| Order **dispatched** (courier, local) or **collected** (pickup) | Tax invoice, issued inside the same database transaction as the status change |
| A refund is started or marked complete on an invoiced order | Credit note for the refunded amount |
| Staff action (Manager or Owner) | Tax invoice for an order shipped earlier, or a manual credit note |

If the invoice cannot be issued (no HSN code on a product, seller GSTIN or address missing or invalid) the dispatch is **refused** with a clear error and the order stays where it was. The system never ships goods it cannot invoice, and never guesses a missing fact.

Orders cancelled before dispatch get no tax invoice, so they need no credit note.

Tax invoicing switches on when `SELLER_GSTIN` is set. Until then the storefront shows an "Order invoice" and states that a GST invoice will follow.

## Configuration

| Variable | Meaning |
| --- | --- |
| `SELLER_GSTIN` | 15-character GSTIN. Validated (format and check character). The state code is taken from its first two digits. |
| `SELLER_LEGAL_NAME` | Defaults to Chameron Industries Private Limited |
| `SELLER_ADDRESS` | Registered address printed on invoices. Required. |
| `SELLER_CIN` | Printed if set |
| `SELLER_STATE_CODE` | Only used while no GSTIN is set. Default `01` (Jammu and Kashmir). |

## Rules implemented

- **Prices are tax-inclusive.** GST is extracted: `tax = gross - round(gross * 10000 / (10000 + rate_bps))`.
- **Place of supply** is the delivery address state (the showroom's state for pickup). The state is chosen from a list at checkout and mapped to its GST state code, so an unrecognised state is rejected rather than guessed.
- **Same state as the seller:** CGST and SGST, half each (any odd paisa goes to SGST). **Different state:** IGST.
- **Delivery and cash-on-delivery charges** are treated as part of the same supply of goods. They are spread across the items in proportion to value and taxed at each item's rate. Taxable values and tax add up exactly to the order total; a test enforces this.
- **Rate and HSN are snapshotted** on each order line when the order is placed, so later product edits never change an issued or pending order.
- **Buyer GSTIN** is optional at checkout. If given it must be valid and registered in the same state as the delivery address. It is printed with the business name. Without it the invoice shows "Unregistered (consumer)".
- **Numbering** is consecutive per financial year (1 April to 31 March, India time), separate series for invoices (`JF/26-27/000001`) and credit notes (`CN/26-27/000001`). Numbers are within the 16-character limit. The counter row is locked inside the issuing transaction, so a rollback gives the number back: no gaps, no duplicates, even under parallel dispatch (tested).
- **Immutability:** database triggers reject any UPDATE or DELETE on invoices and credit notes. Corrections are made with credit notes.
- **Credit notes** are capped by what remains on the invoice, line by line. Several partial notes plus a final "rest" note add back to the invoice exactly (taxable value, each tax head, total). Refunds create their credit note automatically; if that step fails the refund still stands, the failure is logged loudly, and staff can issue the note from the order page.
- **Report:** Admin, GST report. Totals by rate and supply type for a date range, net of credit notes, plus a CSV of every document. Manager or Owner only.

## What the company must supply or confirm

1. `SELLER_GSTIN`, `SELLER_ADDRESS` and `SELLER_CIN` (nothing is invented; they are blank in the repository).
2. **HSN code for every product** (Admin, Products, Edit price & tax). Seed data has none on purpose. Typical apparel chapters are 61 (knitted) and 62 (woven), but the correct 4, 6 or 8 digit code is the accountant's call. Turnover thresholds decide how many digits are mandatory.
3. **GST rate for every product.** The seed applies a suggestion: 5% up to INR 2,500 per piece, 18% above. Rates and thresholds change, and the slab applies to the sale value per piece, so confirm them and the treatment of discounts.
4. The treatment of **delivery and COD fees** as part of a composite supply (above).
5. Whether the **e-invoicing (IRN, QR code)** threshold applies to the company. This build does not call the e-invoice portal. If the threshold applies, invoices need IRN generation before issue.
6. Whether **TCS under section 52 / e-commerce rules** and the **return filing** (GSTR-1, GSTR-3B) are handled in the accounting software. The report here is a working summary, not a filed return.
7. **Invoice format:** the printed layout carries the Rule 46 particulars (supplier, recipient, number, date, HSN, quantity, taxable value, rate, tax by head, place of supply, total in words). Have the accountant review a sample.
8. Credit note treatment for **returns accepted after the end of the financial year**, and the time limit for issuing them.

## Where things are

- Pure rules and unit tests: `apps/api/src/gst/gst.ts`, `gst.test.ts`
- Issuing, numbering, summary: `apps/api/src/gst/gst.service.ts`
- Hooks: `OrdersService.transition` (dispatch/collect), `PaymentsService.refund`, `AdminService.refundComplete`
- Tests: `apps/api/test/gst.e2e.test.ts`
- Storefront rendering: `apps/web/app/order/[number]/invoice/page.tsx`
- Admin: order page "Tax documents" card, `apps/admin/app/gst/page.tsx`
