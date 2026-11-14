"use client";
import { useState } from "react";
import { adm, inrp as inr, label, msg } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface Row { rateBps: number; supply: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }
interface S { invoiceCount: number; creditNoteCount: number; invoicedPaise: number; creditedPaise: number; byRate: Row[]; net: Omit<Row, "rateBps" | "supply">;
  invoices: { number: string; issuedAt: string; buyer: string; buyerGstin: string | null; supply: string; taxablePaise: number; totalPaise: number }[]; creditNotes: { number: string; issuedAt: string; invoice: string; reason: string; totalPaise: number }[] }
const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const monthStart = () => { const n = new Date(Date.now() + 5.5 * 3600_000); return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`; };
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default function Gst() {
  const { can, toast } = useAdmin(); const [from, setFrom] = useState(monthStart()); const [to, setTo] = useState(iso(new Date()));
  const { data, err } = useLoad(() => (can("MANAGER") ? adm<S>(`/admin/gst/summary?from=${from}&to=${to}`) : Promise.resolve(null)), [from, to]);
  const download = async () => { try { const r = await adm<{ filename: string; csv: string }>(`/admin/gst/summary.csv?from=${from}&to=${to}`); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.csv], { type: "text/csv" })); a.download = r.filename; a.click(); URL.revokeObjectURL(a.href); } catch (e) { toast(msg(e), "err"); } };
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can see the GST report.</div>;
  const netTax = data ? data.net.cgstPaise + data.net.sgstPaise + data.net.igstPaise : 0;
  return (<><PageHead title="GST report" sub="Invoices and credit notes issued in the period. Give this to your accountant; it is not a filed return.">
      <button className="btn sec" onClick={download} disabled={!data}>Download CSV</button></PageHead>
    <div className="filters"><label>From <input className="in" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><label>To <input className="in" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div>
    {err && <div className="err-box">{err}</div>}
    {data && <>
      <div className="grid4"><div className="card kpi"><h2>Invoices</h2><b>{data.invoiceCount}</b><span>{inr(data.invoicedPaise)}</span></div><div className="card kpi"><h2>Credit notes</h2><b>{data.creditNoteCount}</b><span>−{inr(data.creditedPaise)}</span></div><div className="card kpi"><h2>Net taxable value</h2><b>{inr(data.net.taxablePaise)}</b><span>After credit notes</span></div><div className="card kpi"><h2>Net GST</h2><b>{inr(netTax)}</b><span>CGST {inr(data.net.cgstPaise)} · SGST {inr(data.net.sgstPaise)} · IGST {inr(data.net.igstPaise)}</span></div></div>
      <h3 style={{ margin: "24px 0 8px" }}>By rate (after credit notes)</h3>
      <div className="tbl"><table><thead><tr><th>Rate</th><th>Supply</th><th className="num">Taxable value</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead><tbody>
        {data.byRate.map((r) => <tr key={`${r.rateBps}${r.supply}`}><td>{r.rateBps / 100}%</td><td>{r.supply === "INTRA" ? "Within state" : "Between states"}</td><td className="num">{inr(r.taxablePaise)}</td><td className="num">{inr(r.cgstPaise)}</td><td className="num">{inr(r.sgstPaise)}</td><td className="num">{inr(r.igstPaise)}</td></tr>)}
        {data.byRate.length === 0 && <tr><td colSpan={6} className="empty">Nothing issued in this period.</td></tr>}</tbody></table></div>
      <h3 style={{ margin: "24px 0 8px" }}>Documents</h3>
      <div className="tbl"><table><thead><tr><th>Number</th><th>Date</th><th>Buyer</th><th>Detail</th><th className="num">Amount</th></tr></thead><tbody>
        {data.invoices.map((i) => <tr key={i.number}><td><b>{i.number}</b></td><td>{day(i.issuedAt)}</td><td>{i.buyer}{i.buyerGstin && <small>{i.buyerGstin}</small>}</td><td>{i.supply === "INTRA" ? "CGST + SGST" : "IGST"}</td><td className="num">{inr(i.totalPaise)}</td></tr>)}
        {data.creditNotes.map((c) => <tr key={c.number}><td><b>{c.number}</b></td><td>{day(c.issuedAt)}</td><td>Credit note</td><td>{label(c.reason)} · against {c.invoice}</td><td className="num">−{inr(c.totalPaise)}</td></tr>)}</tbody></table></div></>}
  </>);
}
