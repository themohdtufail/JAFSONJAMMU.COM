"use client";
import Link from "next/link";
import { adm, inr, label } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface D { today: { orders: number; revenuePaise: number; aovPaise: number }; last14Days: { orders: number; revenuePaise: number; aovPaise: number }; daily: { day: string; orders: number; revenuePaise: number }[]; channels: { type: string; orders: number; revenuePaise: number }[]; collections: { collection: string; revenuePaise: number; units: number }[]; bestsellers: { name: string; units: number; revenuePaise: number }[]; pendingFulfilment: Record<string, number>; lowStock: { sku: string; product: string; colour: string; size: string; available: number }[]; attention: { openReturns: number; quarantinedEvents: number; unpaidOrders: number; refundsToProcess: number } }
const CH: Record<string, string> = { COURIER: "Courier", LOCAL: "Jammu local delivery", PICKUP: "Showroom pickup" };

export default function Dashboard() {
  const { can } = useAdmin(); const { data: d, err } = useLoad(() => adm<D>("/admin/dashboard"), []);
  if (err) return <div className="err-box">{err}</div>;
  if (!d) return <div className="empty">Loading dashboard…</div>;
  const max = Math.max(1, ...d.daily.map((x) => x.revenuePaise)); const needs = ["CONFIRMED", "PICKING", "PACKED", "READY_FOR_PICKUP"].reduce((s, k) => s + (d.pendingFulfilment[k] ?? 0), 0);
  const chMax = Math.max(1, ...d.channels.map((c) => c.revenuePaise)), colTotal = Math.max(1, d.collections.reduce((s, c) => s + c.revenuePaise, 0));
  return (<>
    <PageHead title="Dashboard" sub="Sales exclude cancelled and unpaid orders. Days follow India time." />
    <div className="grid4">
      <div className="card kpi"><h3>Sales today</h3><b>{inr(d.today.revenuePaise)}</b><span>{d.today.orders} {d.today.orders === 1 ? "order" : "orders"}</span></div>
      <div className="card kpi"><h3>Average order value</h3><b>{inr(d.today.aovPaise)}</b><span>Today</span></div>
      <div className="card kpi"><h3>Revenue, 14 days</h3><b>{inr(d.last14Days.revenuePaise)}</b><span>{d.last14Days.orders} orders</span></div>
      <div className="card kpi"><h3>AOV, 14 days</h3><b>{inr(d.last14Days.aovPaise)}</b><span>Per order</span></div>
    </div>
    <div className="attn">
      <Link href="/orders?tab=action" className={needs ? "hot" : ""}><b>{needs}</b><small>to pick, pack or hand over</small></Link>
      <Link href="/orders?tab=unpaid"><b>{d.attention.unpaidOrders}</b><small>awaiting payment</small></Link>
      <Link href="/returns" className={d.attention.openReturns ? "hot" : ""}><b>{d.attention.openReturns}</b><small>returns to review</small></Link>
      <Link href="/orders?tab=refund" className={d.attention.refundsToProcess ? "hot" : ""}><b>{d.attention.refundsToProcess}</b><small>refunds to process</small></Link>
      {can("MANAGER") && <Link href="/store-ops" className={d.attention.quarantinedEvents ? "hot" : ""}><b>{d.attention.quarantinedEvents}</b><small>POS events need attention</small></Link>}
    </div>
    <div className="grid2">
      <div className="card"><h3>Revenue, last 14 days</h3>
        <div className="chart" role="img" aria-label="Daily revenue for the last 14 days">{d.daily.map((x, i) => (
          <div key={x.day} className={`bar ${i === d.daily.length - 1 ? "today" : ""}`} title={`${x.day}: ${inr(x.revenuePaise)}, ${x.orders} orders`}><i style={{ height: `${Math.max(1, (x.revenuePaise / max) * 100)}%` }} /><span>{x.day.slice(8)}</span></div>))}</div></div>
      <div className="card"><h3>Men vs Kids, 30 days</h3>{d.collections.length === 0 ? <p className="empty">No sales yet</p> : <div className="hbar">{d.collections.map((c) => (
        <div key={c.collection}><header><span>{c.collection === "men" ? "Men" : "Kids"}</span><b>{inr(c.revenuePaise)} · {Math.round((c.revenuePaise / colTotal) * 100)}%</b></header><div className="track"><i className={c.collection === "kids" ? "o" : ""} style={{ width: `${(c.revenuePaise / colTotal) * 100}%` }} /></div></div>))}</div>}
        <h3 style={{ marginTop: 28 }}>By channel, 30 days</h3>{d.channels.length === 0 ? <p className="empty">No sales yet</p> : <div className="hbar">{d.channels.map((c) => (
          <div key={c.type}><header><span>{CH[c.type] ?? label(c.type)}</span><b>{inr(c.revenuePaise)} · {c.orders}</b></header><div className="track"><i style={{ width: `${(c.revenuePaise / chMax) * 100}%` }} /></div></div>))}</div>}</div>
    </div>
    <div className="grid2 gap">
      <div className="card"><h3>Low stock (3 or fewer available)</h3>{d.lowStock.length === 0 ? <p className="empty">Nothing running low</p> : <div className="tbl" style={{ border: 0 }}><table><thead><tr><th>Product</th><th>Variant</th><th className="num">Available</th><th /></tr></thead><tbody>{d.lowStock.map((l) => (
        <tr key={l.sku}><td>{l.product}</td><td>{l.colour} · {l.size}<small>{l.sku}</small></td><td className="num"><span className={`pill ${l.available === 0 ? "bad" : "warn"}`}>{l.available === 0 ? "Sold out" : l.available}</span></td><td className="num">{can("MANAGER") && <Link className="btn sm sec" href={`/inventory?q=${l.sku}`}>Restock</Link>}</td></tr>))}</tbody></table></div>}</div>
      <div className="card"><h3>Bestsellers, 30 days</h3>{d.bestsellers.length === 0 ? <p className="empty">No sales yet</p> : <ol style={{ listStyle: "none", display: "grid", gap: 14 }}>{d.bestsellers.map((b, i) => (<li key={b.name} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span><b style={{ color: "var(--mute)", marginRight: 10 }}>{i + 1}</b>{b.name}</span><span style={{ textAlign: "right" }}><b>{b.units}</b> sold<small style={{ display: "block", color: "var(--mute)" }}>{inr(b.revenuePaise)}</small></span></li>))}</ol>}</div>
    </div>
  </>);
}
