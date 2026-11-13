"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr, sizeLabel } from "@/lib/data";
import { useShop } from "@/components/Providers";

interface Order { number: string; status: string; paymentStatus: string; paymentMethod: string; fulfilmentType: string; placedAt: string; totals: { subtotalPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number }; contact: { name: string; phone: string }; shippingAddress: { line1: string; line2?: string; city: string; state: string; postalCode: string };
  items: { id: string; sku: string; name: string; colour: string; size: string; quantity: number; unitPricePaise: number; taxPaise: number; lineTotalPaise: number }[] }
interface Store { legalName: string; gstin: string | null; cin: string | null; address: string | null; phone: string; email: string; stores: string[] }

export default function Invoice() {
  const { number } = useParams<{ number: string }>(); const phone = useSearchParams().get("phone") ?? ""; const { authApi, authReady } = useShop();
  const [o, setO] = useState<Order | null>(null); const [store, setStore] = useState<Store | null>(null); const [err, setErr] = useState("");
  useEffect(() => { if (!authReady) return; authApi<Order>(`/orders/${number}${phone ? `?phone=${phone}` : ""}`).then(setO).catch((e) => setErr(friendly(e))); api<Store>("/store").then(setStore).catch(() => {}); }, [authReady, authApi, number, phone]);
  useEffect(() => { document.title = `Invoice ${number} | Jafson Jammu`; }, [number]);
  if (err) return <section className="banner"><div className="wrap"><h1>We couldn't find that order</h1><p className="lede">{err}</p></div></section>;
  if (!o || !store) return <section className="banner"><div className="wrap"><p className="lede">Loading…</p></div></section>;
  if (["PENDING_PAYMENT", "CANCELLED"].includes(o.status)) return <section className="banner"><div className="wrap"><h1>No invoice yet</h1><p className="lede">An invoice is available once an order is confirmed and not cancelled.</p><Link className="btn" href={`/order/${o.number}?phone=${phone}`}>Back to order</Link></div></section>;
  const a = o.shippingAddress, taxInvoice = !!store.gstin;
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
