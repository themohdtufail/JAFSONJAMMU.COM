"use client";
import { useParams } from "next/navigation";
import { adm, inr, when } from "@/lib/api";
import { useLoad } from "@/components/Shell";

/** Packing slip in the brand kit's invoice style: white, charcoal horizontal logo top-left, flame rule, tabular figures, Chameron legal line. */
export default function Slip() {
  const { number } = useParams<{ number: string }>(); const { data: o, err } = useLoad(() => adm<any>(`/admin/orders/${number}`), [number]);
  if (err) return <p style={{ padding: 40 }}>{err}</p>; if (!o) return <p style={{ padding: 40 }}>Loading…</p>;
  const a = o.shippingAddress, units = o.items.reduce((n: number, i: any) => n + i.quantity, 0);
  return (<div className="slip"><div className="noprint"><button className="btn" onClick={() => window.print()}>Print</button></div>
    <div className="slip-head"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} /><div><h1>Packing slip</h1><p>Order <b>{o.number}</b><br />{when(o.placedAt)}</p></div></div>
    <div className="slip-rule" />
    <div className="slip-to"><div><h2>{o.fulfilmentType === "PICKUP" ? "Customer (pickup)" : "Ship to"}</h2><p><b>{o.contact.name}</b><br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}<br />+91 {o.contact.phone}</p></div>
      <div><h2>Delivery</h2><p>{o.fulfilmentType === "PICKUP" ? "Showroom pickup" : o.fulfilmentType === "LOCAL" ? "Jammu local delivery" : "Courier"}<br />{units} {units === 1 ? "item" : "items"}</p></div></div>
    <table><thead><tr><th>SKU</th><th>Item</th><th>Variant</th><th>Qty</th></tr></thead><tbody>{o.items.map((i: any) => <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.colour} · {i.size}</td><td>{i.quantity}</td></tr>)}</tbody></table>
    <p className="slip-pay">{o.paymentMethod === "COD" ? <b>Collect {inr(o.totals.totalPaise)} on delivery</b> : <>Paid online · {inr(o.totals.totalPaise)}</>}</p>
    <div className="slip-foot">Jafson Jammu is managed by Chameron Industries Private Limited.</div></div>);
}
