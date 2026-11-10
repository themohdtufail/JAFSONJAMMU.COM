"use client";
import { useParams } from "next/navigation";
import { adm, inr, when } from "@/lib/api";
import { useLoad } from "@/components/Shell";

export default function Slip() {
  const { number } = useParams<{ number: string }>(); const { data: o, err } = useLoad(() => adm<any>(`/admin/orders/${number}`), [number]);
  if (err) return <p style={{ padding: 40 }}>{err}</p>; if (!o) return <p style={{ padding: 40 }}>Loading…</p>;
  const a = o.shippingAddress;
  return (<div className="slip"><div className="noprint"><button className="btn" onClick={() => window.print()}>Print</button></div>
    <h1>JAFSON JAMMU</h1><p>Packing slip · Order <b>{o.number}</b> · {when(o.placedAt)}</p><hr style={{ margin: "16px 0" }} />
    <p><b>{o.fulfilmentType === "PICKUP" ? "Customer (pickup)" : "Ship to"}</b><br />{o.contact.name} · {o.contact.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postalCode}</p>
    <table style={{ marginTop: 20 }}><thead><tr><th>SKU</th><th>Item</th><th>Variant</th><th>Qty</th></tr></thead><tbody>{o.items.map((i: any) => <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.colour} · {i.size}</td><td>{i.quantity}</td></tr>)}</tbody></table>
    <p style={{ marginTop: 20 }}>{o.paymentMethod === "COD" ? <b>COLLECT {inr(o.totals.totalPaise)} ON DELIVERY</b> : <>Paid online · {inr(o.totals.totalPaise)}</>}</p></div>);
}
