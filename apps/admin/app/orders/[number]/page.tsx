"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { adm, inr, label, msg, NEXT_STEP, STEP_LABEL, tone, when } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface D { number: string; status: string; paymentStatus: string; paymentMethod: string; fulfilmentType: string; placedAt: string; pickupCode: string | null; totals: { subtotalPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number }; contact: { name: string; phone: string }; shippingAddress: any;
  items: { id: string; sku: string; name: string; colour: string; size: string; imageUrl: string | null; quantity: number; unitPricePaise: number; lineTotalPaise: number }[]; history: { from: string | null; to: string; actor: string; note: string | null; at: string }[]; payments: { provider: string; ref: string; providerPaymentId: string | null; method: string | null; amountPaise: number; status: string; at: string; refunds: { id: string | null; amountPaise: number; status: string; at: string }[] }[]; returns: { ref: string; status: string }[] }

export default function OrderDetail() {
  const { number } = useParams<{ number: string }>(); const { can, toast } = useAdmin(); const { data: o, err, reload } = useLoad(() => adm<D>(`/admin/orders/${number}`), [number]);
  const [busy, setBusy] = useState(false); const [code, setCode] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(false); } };
  if (err) return <div className="err-box">{err}</div>;
  if (!o) return <div className="empty">Loading…</div>;
  const next = NEXT_STEP[o.fulfilmentType]?.[o.status]; const captured = o.payments.find((p) => p.status === "CAPTURED"); const hasOnline = !!captured; const liveRefund = captured?.refunds.some((r) => ["PENDING", "PROCESSED"].includes(r.status)); const canRefundOnline = hasOnline && !liveRefund && (["CANCELLED", "DELIVERED", "COLLECTED"].includes(o.status) || ["REFUND_DUE", "REFUND_PENDING"].includes(o.paymentStatus)) && o.paymentStatus !== "REFUNDED"; const a = o.shippingAddress; const cancellable = ["CONFIRMED", "PICKING", "PACKED", "READY_FOR_PICKUP", "PENDING_PAYMENT"].includes(o.status);
  return (<>
    <PageHead title={`Order ${o.number}`} sub={`Placed ${when(o.placedAt)}`}>
      <span className={`pill ${tone(o.status)}`}>{label(o.status)}</span><span className={`pill ${tone(o.paymentStatus)}`}>{label(o.paymentStatus)}</span>
      <Link className="btn sec sm" href={`/orders/${o.number}/slip`} target="_blank">Packing slip</Link></PageHead>
    <div className="detail">
      <div style={{ display: "grid", gap: 16 }}>
        <div className="card"><h3>Items</h3><div className="tbl" style={{ border: 0 }}><table><tbody>{o.items.map((i) => (<tr key={i.id}><td style={{ width: 56 }}><img className="thumb" src={i.imageUrl ?? ""} alt="" /></td><td>{i.name}<small>{i.colour} · {i.size} · {i.sku}</small></td><td className="num">{i.quantity} × {inr(i.unitPricePaise)}</td><td className="num"><b>{inr(i.lineTotalPaise)}</b></td></tr>))}</tbody></table></div>
          <dl className="kv" style={{ marginTop: 16, gridTemplateColumns: "1fr auto", maxWidth: 320, marginLeft: "auto" }}><dt>Subtotal</dt><dd className="num">{inr(o.totals.subtotalPaise)}</dd><dt>Shipping</dt><dd className="num">{o.totals.shippingPaise ? inr(o.totals.shippingPaise) : "Free"}</dd>{o.totals.codFeePaise > 0 && <><dt>COD fee</dt><dd className="num">{inr(o.totals.codFeePaise)}</dd></>}<dt>GST included</dt><dd className="num">{inr(o.totals.taxPaise)}</dd><dt><b>Total</b></dt><dd className="num"><b>{inr(o.totals.totalPaise)}</b></dd></dl></div>
        <div className="card"><h3>Actions</h3><div className="actions">
          {next && next !== "COLLECTED" && <button className="btn" disabled={busy} onClick={() => run(() => adm(`/admin/orders/${o.number}/transition`, { method: "POST", body: { to: next } }), `Order ${label(next).toLowerCase()}`)}>{STEP_LABEL[next]}</button>}
          {next === "COLLECTED" && <><input className="in" style={{ maxWidth: 160 }} placeholder="Customer's pickup code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /><button className="btn" disabled={busy || code.length !== 6} onClick={() => run(() => adm(`/admin/orders/${o.number}/transition`, { method: "POST", body: { to: "COLLECTED", pickupCode: code } }), "Collection confirmed")}>{STEP_LABEL.COLLECTED}</button></>}
          {cancellable && <button className="btn danger" disabled={busy} onClick={() => confirm(`Cancel order ${o.number}? Reserved stock will be released.`) && run(() => adm(`/admin/orders/${o.number}/cancel`, { method: "POST" }), "Order cancelled")}>Cancel order</button>}
          {can("MANAGER") && canRefundOnline && <button className="btn" disabled={busy} onClick={() => confirm(`Refund ${inr(o.totals.totalPaise)} to the customer's original payment method? This can't be undone.`) && run(() => adm(`/admin/orders/${o.number}/refund`, { method: "POST", body: { reason: o.status === "CANCELLED" ? "Order cancelled" : "Refund" } }), "Refund sent to the payment provider")}>Refund {inr(o.totals.totalPaise)} online</button>}
          {["REFUND_PENDING", "REFUND_DUE"].includes(o.paymentStatus) && can("MANAGER") && !hasOnline && <button className="btn sec" disabled={busy} onClick={() => confirm(`Confirm you have refunded ${inr(o.totals.totalPaise)} to the customer outside this system?`) && run(() => adm(`/admin/orders/${o.number}/refund-complete`, { method: "POST" }), "Refund recorded")}>Mark refund completed</button>}
          {!next && !cancellable && !["REFUND_PENDING", "REFUND_DUE"].includes(o.paymentStatus) && <span style={{ color: "var(--mute)" }}>No actions available for this order.</span>}</div>
          {o.fulfilmentType === "PICKUP" && o.pickupCode && o.status !== "COLLECTED" && <p style={{ marginTop: 12, color: "var(--mute)" }}>The customer holds a 6-digit pickup code. Ask for it at the counter.</p>}
          {["REFUND_PENDING", "REFUND_DUE"].includes(o.paymentStatus) && <p style={{ marginTop: 12, color: "var(--warn)" }}>{hasOnline ? `A refund of ${inr(o.totals.totalPaise)} is owed. Use "Refund online" and the payment provider returns it to the customer.` : `A refund of ${inr(o.totals.totalPaise)} is owed. This order has no online payment, so refund it manually, then mark it done.`}</p>}</div>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="card"><h3>Customer</h3><dl className="kv"><dt>Name</dt><dd>{o.contact.name}</dd><dt>Mobile</dt><dd>{o.contact.phone}</dd><dt>{o.fulfilmentType === "PICKUP" ? "Pickup at" : "Ship to"}</dt><dd>{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}</dd><dt>Delivery</dt><dd>{label(o.fulfilmentType)}</dd><dt>Payment</dt><dd>{o.paymentMethod}</dd></dl></div>
        <div className="card"><h3>History</h3><ul className="tl">{o.history.map((h, i) => (<li key={i}><b>{label(h.to)}</b><small>{when(h.at)} · {h.actor}{h.note ? ` · ${h.note}` : ""}</small></li>))}</ul></div>
        {o.payments.length > 0 && <div className="card"><h3>Payments</h3>{o.payments.map((p) => <div key={p.ref} style={{ fontSize: 14, marginBottom: 12 }}>{label(p.provider)}{p.method ? ` · ${p.method.toUpperCase()}` : ""} · {inr(p.amountPaise)} · <span className={`pill ${p.status === "CAPTURED" ? "ok" : p.status === "FAILED" ? "bad" : "warn"}`}>{p.status === "CREATED" ? "Awaiting payment" : label(p.status)}</span>
            <small style={{ display: "block", color: "var(--mute)" }}>Order {p.ref}{p.providerPaymentId ? ` · Payment ${p.providerPaymentId}` : ""}</small>
            {p.refunds.map((rf, i) => <small key={i} style={{ display: "block", color: rf.status === "FAILED" ? "var(--bad)" : "var(--ink)" }}>Refund {inr(rf.amountPaise)} · {label(rf.status)} · {when(rf.at)}{rf.id ? ` · ${rf.id}` : ""}</small>)}</div>)}</div>}
        {o.returns.length > 0 && <div className="card"><h3>Returns</h3>{o.returns.map((r) => <Link key={r.ref} href="/returns" className="link">{r.ref} · {label(r.status)}</Link>)}</div>}
      </div>
    </div></>);
}
