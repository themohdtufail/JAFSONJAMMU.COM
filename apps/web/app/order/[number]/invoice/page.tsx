"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr, inrp, sizeLabel } from "@/lib/data";
import { useShop } from "@/components/Providers";

interface Order { number: string; status: string; paymentStatus: string; paymentMethod: string; fulfilmentType: string; placedAt: string; totals: { subtotalPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number }; contact: { name: string; phone: string }; shippingAddress: { line1: string; line2?: string; city: string; state: string; postalCode: string };
  items: { id: string; sku: string; name: string; colour: string; size: string; quantity: number; unitPricePaise: number; taxPaise: number; lineTotalPaise: number }[] }
interface Line { sku: string; name: string; variant: string; hsn: string; quantity: number; rateBps: number; grossPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }
interface Totals { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; totalInWords: string; lines: Line[] }
interface Inv extends Totals { number: string; issuedAt: string; sellerName: string; sellerGstin: string; sellerAddress: string; buyerName: string; buyerGstin: string | null; buyerBusinessName: string | null; billingAddress: Order["shippingAddress"]; placeOfSupply: string; placeOfSupplyCode: string; supply: "INTRA" | "INTER" }
interface Cn extends Totals { number: string; issuedAt: string; reason: string }
interface Store { legalName: string; gstin: string | null; cin: string | null; address: string | null; phone: string; email: string; stores: string[] }

export default function Invoice() {
  const { number } = useParams<{ number: string }>(); const phone = useSearchParams().get("phone") ?? ""; const { authApi, authReady } = useShop();
  const [o, setO] = useState<Order | null>(null); const [store, setStore] = useState<Store | null>(null); const [err, setErr] = useState(""); const [docs, setDocs] = useState<{ invoice: Inv | null; creditNotes: Cn[] } | null>(null);
  useEffect(() => { if (!authReady) return; authApi<Order>(`/orders/${number}${phone ? `?phone=${phone}` : ""}`).then(setO).catch((e) => setErr(friendly(e))); api<Store>("/store").then(setStore).catch(() => {}); authApi<{ invoice: Inv | null; creditNotes: Cn[] }>(`/orders/${number}/documents${phone ? `?phone=${phone}` : ""}`).then(setDocs).catch(() => setDocs({ invoice: null, creditNotes: [] })); }, [authReady, authApi, number, phone]);
  useEffect(() => { document.title = `Invoice ${number} | Jafson Jammu`; }, [number]);
  if (err) return <section className="banner"><div className="wrap"><h1>We couldn't find that order</h1><p className="lede">{err}</p></div></section>;
  if (!o || !store || !docs) return <section className="banner"><div className="wrap"><p className="lede">Loading…</p></div></section>;
  if (["PENDING_PAYMENT", "CANCELLED"].includes(o.status)) return <section className="banner"><div className="wrap"><h1>No invoice yet</h1><p className="lede">An invoice is available once an order is confirmed and not cancelled.</p><Link className="btn" href={`/order/${o.number}?phone=${phone}`}>Back to order</Link></div></section>;
  const a = o.shippingAddress, taxInvoice = !!docs.invoice;
  const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  if (docs.invoice) {
    const i = docs.invoice, ba = i.billingAddress, intra = i.supply === "INTRA";
    const Table = ({ lines, t, credit }: { lines: Line[]; t: Totals; credit?: boolean }) => (
      <table className="inv-table gst"><thead><tr><th>Description</th><th>HSN</th>{!credit && <th>Qty</th>}<th>Taxable value</th><th>Rate</th>{intra ? <><th>CGST</th><th>SGST</th></> : <th>IGST</th>}<th>Amount</th></tr></thead>
        <tbody>{lines.map((l, n) => <tr key={n}><td>{l.name}<small>{l.variant} · {l.sku}</small></td><td>{l.hsn}</td>{!credit && <td>{l.quantity}</td>}<td>{inrp(l.taxablePaise)}</td><td>{l.rateBps / 100}%</td>{intra ? <><td>{inrp(l.cgstPaise)}</td><td>{inrp(l.sgstPaise)}</td></> : <td>{inrp(l.igstPaise)}</td>}<td>{inrp(l.grossPaise)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={credit ? 2 : 3}>Total</td><td>{inrp(t.taxablePaise)}</td><td />{intra ? <><td>{inrp(t.cgstPaise)}</td><td>{inrp(t.sgstPaise)}</td></> : <td>{inrp(t.igstPaise)}</td>}<td>{inrp(t.totalPaise)}</td></tr></tfoot></table>);
    return (
      <div className="wrap invoice-wrap">
        <div className="noprint inv-actions"><Link className="btn outline" href={`/order/${o.number}?phone=${phone}`}>Back to order</Link><button className="btn" onClick={() => window.print()}>Print or save as PDF</button></div>
        <article className="invoice">
          <header className="inv-head"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} />
            <div className="inv-meta"><h1>Tax invoice</h1><p>Invoice no. <b>{i.number}</b><br />Date {day(i.issuedAt)}<br />Order {o.number}</p></div></header>
          <div className="inv-rule" />
          <section className="inv-parties">
            <div><h2>Supplier</h2><p><b>{i.sellerName}</b> (trading as Jafson Jammu)<br />{i.sellerAddress}<br />GSTIN {i.sellerGstin}{store.cin && <><br />CIN {store.cin}</>}</p></div>
            <div><h2>Recipient</h2><p><b>{i.buyerBusinessName || i.buyerName}</b>{i.buyerBusinessName && <><br />Attn: {i.buyerName}</>}<br />{ba.line1}{ba.line2 ? `, ${ba.line2}` : ""}<br />{ba.city}, {ba.state} {ba.postalCode}{i.buyerGstin ? <><br />GSTIN {i.buyerGstin}</> : <><br />Unregistered (consumer)</>}</p></div>
            <div><h2>Place of supply</h2><p><b>{i.placeOfSupply}</b> ({i.placeOfSupplyCode})<br />{intra ? "Within the state: CGST and SGST" : "Between states: IGST"}<br />{o.paymentMethod === "COD" ? "Cash on delivery" : o.paymentMethod}</p></div>
          </section>
          <Table lines={i.lines} t={i} />
          <p className="inv-words"><b>Amount in words:</b> {i.totalInWords}</p>
          <p className="inv-note">Delivery and cash-on-delivery charges are included in the values above, taxed at the rate of the goods supplied. Prices include GST. This is a computer-generated invoice and needs no signature.</p>
          <footer className="inv-foot">Jafson Jammu is managed by Chameron Industries Private Limited.</footer>
        </article>
        {docs.creditNotes.map((c) => (
          <article className="invoice credit" key={c.number}>
            <header className="inv-head"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} />
              <div className="inv-meta"><h1>Credit note</h1><p>Credit note no. <b>{c.number}</b><br />Date {day(c.issuedAt)}<br />Against invoice <b>{i.number}</b> of {day(i.issuedAt)}</p></div></header>
            <div className="inv-rule" />
            <section className="inv-parties"><div><h2>Supplier</h2><p><b>{i.sellerName}</b><br />GSTIN {i.sellerGstin}</p></div><div><h2>Recipient</h2><p><b>{i.buyerBusinessName || i.buyerName}</b>{i.buyerGstin && <><br />GSTIN {i.buyerGstin}</>}</p></div><div><h2>Reason</h2><p>{c.reason}<br />Place of supply {i.placeOfSupply} ({i.placeOfSupplyCode})</p></div></section>
            <Table lines={c.lines} t={c} credit />
            <p className="inv-words"><b>Amount in words:</b> {c.totalInWords}</p>
            <p className="inv-note">This credit note reduces the value of the invoice above. This is a computer-generated document and needs no signature.</p>
          </article>))}
      </div>);
  }
  return (
    <div className="wrap invoice-wrap">
      <div className="noprint inv-actions"><Link className="btn outline" href={`/order/${o.number}?phone=${phone}`}>Back to order</Link><button className="btn" onClick={() => window.print()}>Print or save as PDF</button></div>
      <article className="invoice">
        <header className="inv-head"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} />
          <div className="inv-meta"><h1>{taxInvoice ? "Tax invoice" : "Order invoice"}</h1><p>Order <b>{o.number}</b><br />{new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p></div></header>
        <div className="inv-rule" />
        <section className="inv-parties">
          <div><h2>Sold by</h2><p><b>{store.legalName}</b> (trading as Jafson Jammu)<br />{store.address && <>{store.address}<br /></>}{store.gstin && <>GSTIN {store.gstin}<br /></>}{store.cin && <>CIN {store.cin}<br /></>}{store.phone} · {store.email}</p></div>
          <div><h2>{o.fulfilmentType === "PICKUP" ? "Collected by" : "Billed and shipped to"}</h2><p><b>{o.contact.name}</b><br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}<br />+91 {o.contact.phone}</p></div>
          <div><h2>Payment</h2><p>{o.paymentMethod === "COD" ? "Cash on delivery" : o.paymentMethod}<br />{({ PAID: "Paid", COD_PENDING: "To be paid on delivery", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partly refunded" } as Record<string, string>)[o.paymentStatus] ?? o.paymentStatus}</p></div>
        </section>
        <table className="inv-table"><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>GST included</th><th>Amount</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.id}><td>{i.name}<small>{i.colour} · {sizeLabel(i.size)}</small></td><td>{i.sku}</td><td>{i.quantity}</td><td>{inr(i.unitPricePaise)}</td><td>{inr(i.taxPaise)}</td><td>{inr(i.lineTotalPaise)}</td></tr>)}</tbody></table>
        <dl className="inv-totals"><dt>Subtotal</dt><dd>{inr(o.totals.subtotalPaise)}</dd><dt>Delivery</dt><dd>{o.totals.shippingPaise ? inr(o.totals.shippingPaise) : "Free"}</dd>{o.totals.codFeePaise > 0 && <><dt>Cash on delivery fee</dt><dd>{inr(o.totals.codFeePaise)}</dd></>}<dt className="grand">Total</dt><dd className="grand">{inr(o.totals.totalPaise)}</dd></dl>
        <p className="inv-note">All prices are in Indian rupees and include GST. GST included in the items above: {inr(o.totals.taxPaise)}.{!taxInvoice && " This is an order invoice. A GST tax invoice with the seller's GSTIN will be issued once the company's registration details are added."}</p>
        <footer className="inv-foot">Jafson Jammu is managed by Chameron Industries Private Limited.</footer>
      </article>
    </div>
  );
}
