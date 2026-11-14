"use client";
import { useState } from "react";
import { adm, inrp as inr, msg } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface Row { key: string; orders: number; units: number; itemsPaise: number; discountPaise: number; feesPaise: number; taxPaise: number; totalPaise: number }
interface R { rows: Row[]; totals: { orders: number; units: number | null; itemsPaise: number | null; totalPaise: number | null; returnRequests: number } }
const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const VIEWS = [["day", "By day"], ["category", "By category"], ["product", "Top products"]] as const;

export default function Reports() {
  const { can, toast } = useAdmin(); const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400_000))); const [to, setTo] = useState(iso(new Date())); const [by, setBy] = useState<"day" | "category" | "product">("day");
  const { data, err } = useLoad(() => (can("MANAGER") ? adm<R>(`/admin/reports/sales?from=${from}&to=${to}&by=${by}`) : Promise.resolve(null)), [from, to, by]);
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can see reports.</div>;
  const download = async () => { try { const r = await adm<{ filename: string; csv: string }>(`/admin/reports/sales.csv?from=${from}&to=${to}&by=${by}`); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.csv], { type: "text/csv" })); a.download = r.filename; a.click(); URL.revokeObjectURL(a.href); } catch (e) { toast(msg(e), "err"); } };
  const max = Math.max(1, ...(data?.rows.map((r) => r.totalPaise) ?? [1]));
  return (<><PageHead title="Sales reports" sub="Confirmed orders that were not cancelled. Amounts are what customers paid, GST included."><button className="btn sec" onClick={download} disabled={!data}>Download CSV</button></PageHead>
    <div className="filters"><label>From <input className="in" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><label>To <input className="in" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      {VIEWS.map(([k, l]) => <button key={k} className={`btn sm ${by === k ? "" : "sec"}`} onClick={() => setBy(k)}>{l}</button>)}</div>
    {err && <div className="err-box">{err}</div>}
    {data && <><div className="grid4"><div className="card kpi"><h2>Orders</h2><b>{data.totals.orders}</b><span>In this period</span></div><div className="card kpi"><h2>Sales</h2><b>{data.totals.totalPaise !== null ? inr(data.totals.totalPaise) : "—"}</b><span>{by === "day" ? "Including delivery and COD fees" : "Shown in the table below"}</span></div><div className="card kpi"><h2>Units sold</h2><b>{data.totals.units ?? "—"}</b><span>{by === "day" ? "Items shipped or to ship" : ""}</span></div><div className="card kpi"><h2>Return requests</h2><b>{data.totals.returnRequests}</b><span>Not rejected</span></div></div>
      <div className="tbl" style={{ marginTop: 16 }}><table><thead><tr><th>{by === "day" ? "Date" : by === "category" ? "Category" : "Product"}</th><th className="num">Orders</th><th className="num">Units</th><th className="num">Items</th><th className="num">Discounts</th><th className="num">GST included</th><th className="num">{by === "day" ? "Total" : "Sales"}</th><th aria-hidden style={{ width: 120 }} /></tr></thead><tbody>
        {data.rows.map((r) => <tr key={r.key}><td><b>{r.key}</b></td><td className="num">{r.orders}</td><td className="num">{r.units}</td><td className="num">{inr(r.itemsPaise)}</td><td className="num">{r.discountPaise ? `−${inr(r.discountPaise)}` : "—"}</td><td className="num">{inr(r.taxPaise)}</td><td className="num"><b>{inr(r.totalPaise)}</b></td><td aria-hidden><div style={{ height: 8, borderRadius: 4, background: "var(--flame, #F1521D)", width: `${Math.max(2, Math.round((r.totalPaise / max) * 100))}%` }} /></td></tr>)}
        {data.rows.length === 0 && <tr><td colSpan={8} className="empty">No sales in this period.</td></tr>}</tbody></table></div></>}</>);
}
