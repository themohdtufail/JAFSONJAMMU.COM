"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr } from "@/lib/data";
import { useShop } from "@/components/Providers";

interface Order { number: string; status: string; paymentStatus: string; paymentMethod: string; fulfilmentType: string; placedAt: string; expiresAt: string | null; pickupCode: string | null; cancelled: boolean;
  totals: { subtotalPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number }; contact: { name: string; phone: string }; shippingAddress: any;
  items: { id: string; sku: string; name: string; colour: string; size: string; imageUrl: string | null; quantity: number; unitPricePaise: number; lineTotalPaise: number }[]; steps: { code: string; label: string; at: string | null; done: boolean }[] }

const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const CAN_CANCEL = ["PENDING_PAYMENT", "CONFIRMED", "PICKING", "PACKED", "READY_FOR_PICKUP"];

export default function OrderPage() {
  const { number } = useParams<{ number: string }>(); const sp = useSearchParams(); const phone = sp.get("phone") ?? ""; const fresh = sp.get("new") === "1";
  const { authApi, authReady, toast } = useShop();
  const [o, setO] = useState<Order | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [left, setLeft] = useState(0);
  const load = useCallback(() => authApi<Order>(`/orders/${number}${phone ? `?phone=${phone}` : ""}`).then(setO).catch((e) => setErr(friendly(e))), [authApi, number, phone]);
  useEffect(() => { if (authReady) load(); }, [authReady, load]);
  useEffect(() => { if (!o?.expiresAt || o.status !== "PENDING_PAYMENT") return; const t = setInterval(() => { const s = Math.max(0, Math.round((new Date(o.expiresAt!).getTime() - Date.now()) / 1000)); setLeft(s); if (s === 0) { clearInterval(t); load(); } }, 1000); return () => clearInterval(t); }, [o, load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok); await load(); } catch (e) { toast(friendly(e), "err"); } finally { setBusy(false); } };
  const payNow = () => act(async () => { const s = await api<{ paymentRef: string }>("/payments/session", { method: "POST", body: { orderNumber: number, phone } }); await api(`/payments/mock/${s.paymentRef}/pay`, { method: "POST", body: {} }); }, "Payment received");
  const cancel = () => confirm("Cancel this order?") && act(() => authApi(`/orders/${number}/cancel`, { method: "POST", body: { phone: phone || undefined } }), "Order cancelled");

  if (err) return <section className="banner"><p className="eyebrow">Order</p><h1>We couldn't find that order</h1><p className="lede">{err}</p><Link className="btn" href="/track">Try again</Link></section>;
  if (!o) return <section className="banner"><p className="eyebrow">Order</p><h1>{number}</h1><p className="lede">Loading…</p></section>;
  const addr = o.shippingAddress;
  const heading = o.cancelled ? "Order cancelled" : o.status === "PENDING_PAYMENT" ? "Awaiting payment" : fresh ? "Thank you for your order" : `Order ${o.number}`;
  return (
    <>
      <section className="banner slim"><p className="eyebrow">{fresh && !o.cancelled ? `Order ${o.number}` : "Order status"}</p><h1>{heading}</h1>
        {fresh && o.status === "CONFIRMED" && <p className="lede">We've received it and will start preparing it at our Jammu showroom.</p>}</section>
      <div className="wrap ord-page">
        <div>
          {o.status === "PENDING_PAYMENT" && <div className="callout"><div><b>Complete your payment</b><span>We're holding your items for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}.</span></div><button className="btn" disabled={busy} onClick={payNow}>Pay {inr(o.totals.totalPaise)}</button></div>}
          {o.paymentStatus === "REFUND_PENDING" && <div className="callout"><div><b>Refund in progress</b><span>Your refund will go back to your original payment method.</span></div></div>}
          {o.pickupCode && !o.cancelled && <div className="callout pick"><div><b>Pickup code</b><span>Show this code at the JAFSON showroom, Jammu.</span></div><code>{o.pickupCode}</code></div>}
          {!o.cancelled && <ol className="steps">
            <li className="done"><b>Order placed</b><span>{fmt(o.placedAt)}</span></li>
            {o.steps.map((s) => <li key={s.code} className={s.done ? "done" : ""}><b>{s.label}</b><span>{s.at ? fmt(s.at) : "Pending"}</span></li>)}
          </ol>}
          <div className="ord-actions">
            <Link className="btn outline" href="/collections/new-arrivals">Continue shopping</Link>
            {(o.status === "DELIVERED" || o.status === "COLLECTED") && <Link className="btn outline" href={`/returns?order=${o.number}&phone=${phone}`}>Return or exchange</Link>}
            {CAN_CANCEL.includes(o.status) && <button className="btn outline" disabled={busy} onClick={cancel}>Cancel order</button>}
          </div>
        </div>
        <aside className="sum">
          <h2>Summary</h2>
          {o.items.map((i) => <div key={i.id} className="row"><img src={i.imageUrl ?? ""} alt="" width={56} height={72} /><span>{i.name}<small>{i.colour} · {i.size} · Qty {i.quantity}</small></span><b>{inr(i.lineTotalPaise)}</b></div>)}
          <div className="tot"><div><span>Subtotal</span><b>{inr(o.totals.subtotalPaise)}</b></div><div><span>Shipping</span><b>{o.totals.shippingPaise ? inr(o.totals.shippingPaise) : "Free"}</b></div>{o.totals.codFeePaise > 0 && <div><span>COD handling</span><b>{inr(o.totals.codFeePaise)}</b></div>}
            <div className="grand"><span>Total</span><b>{inr(o.totals.totalPaise)}</b></div><small>Includes {inr(o.totals.taxPaise)} GST · {o.paymentMethod === "COD" ? "Cash on delivery" : o.paymentStatus === "PAID" ? "Paid" : "Payment pending"}</small></div>
          <div className="addr"><h3>{o.fulfilmentType === "PICKUP" ? "Pickup from" : "Delivering to"}</h3><p>{o.contact.name}<br />{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />{addr.city}, {addr.state} {addr.postalCode}</p></div>
        </aside>
      </div>
    </>
  );
}
