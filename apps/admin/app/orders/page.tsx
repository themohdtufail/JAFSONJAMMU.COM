"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adm, inr, label, tone, when } from "@/lib/api";
import { PageHead, useLoad } from "@/components/Shell";

interface O { number: string; status: string; paymentStatus: string; paymentMethod: string; fulfilmentType: string; placedAt: string; contact: { name: string; phone: string }; totals: { totalPaise: number }; items: { quantity: number }[] }
const TABS: [string, string, string][] = [["all", "All", ""], ["action", "Needs action", "CONFIRMED,PICKING,PACKED,READY_FOR_PICKUP"], ["unpaid", "Awaiting payment", "PENDING_PAYMENT"], ["out", "Out for delivery", "DISPATCHED"], ["done", "Completed", "DELIVERED,COLLECTED"], ["cancelled", "Cancelled", "CANCELLED"]];
const SIZE = 20;

export default function Orders() {
  const router = useRouter(); const [tab, setTab] = useState("all"); const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [page, setPage] = useState(0);
  useEffect(() => { const t = new URLSearchParams(location.search).get("tab"); if (t === "refund") { setTab("all"); setQ(""); } else if (t) setTab(t); }, []);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  const status = TABS.find((t) => t[0] === tab)?.[2] ?? "";
  const { data, err } = useLoad(() => adm<{ total: number; items: O[] }>(`/admin/orders?limit=${SIZE}&offset=${page * SIZE}${status ? `&status=${status}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`), [status, dq, page]);
  return (<>
    <PageHead title="Orders" sub="Search by order number, customer name or mobile." />
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPage(0); }}>{l}</button>)}</div>
    <div className="filters"><input className="in" placeholder="Search orders…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" /></div>
    {err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Delivery</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead><tbody>
      {data?.items.map((o) => (<tr key={o.number} className="click" onClick={() => router.push(`/orders/${o.number}`)}>
        <td><Link href={`/orders/${o.number}`} onClick={(e) => e.stopPropagation()}><b>{o.number}</b></Link><small>{o.items.reduce((s, i) => s + i.quantity, 0)} items</small></td><td>{when(o.placedAt)}</td><td>{o.contact.name}<small>{o.contact.phone}</small></td>
        <td>{label(o.fulfilmentType)}</td><td>{o.paymentMethod}<small><span className={`pill ${tone(o.paymentStatus)}`}>{label(o.paymentStatus)}</span></small></td><td><span className={`pill ${tone(o.status)}`}>{label(o.status)}</span></td><td className="num"><b>{inr(o.totals.totalPaise)}</b></td></tr>))}
      {data && data.items.length === 0 && <tr><td colSpan={7} className="empty">No orders match.</td></tr>}{!data && !err && <tr><td colSpan={7} className="empty">Loading…</td></tr>}</tbody></table></div>
    {data && <div className="pager"><span>{data.total} {data.total === 1 ? "order" : "orders"}</span><div className="actions"><button className="btn sm sec" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm sec" disabled={(page + 1) * SIZE >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>}
  </>);
}
