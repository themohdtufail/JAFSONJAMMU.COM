"use client";
import { useEffect, useState } from "react";
import { adm, inr, when } from "@/lib/api";
import { PageHead, useLoad } from "@/components/Shell";

interface C { id: string; name: string | null; phone: string; status: string; joinedAt: string; orders: number; spentPaise: number; lastOrderAt: string | null }
export default function Customers() {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err } = useLoad(() => adm<C[]>(`/admin/customers${dq ? `?q=${encodeURIComponent(dq)}` : ""}`), [dq]);
  return (<><PageHead title="Customers" sub="Registered accounts. Guest orders appear under Orders." />
    <div className="filters"><input className="in" placeholder="Search name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" /></div>{err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Customer</th><th>Joined</th><th className="num">Orders</th><th className="num">Total spent</th><th>Last order</th><th>Status</th></tr></thead><tbody>
      {data?.map((c) => <tr key={c.id}><td><b>{c.name ?? "—"}</b><small>+91 {c.phone}</small></td><td>{when(c.joinedAt)}</td><td className="num">{c.orders}</td><td className="num">{inr(c.spentPaise)}</td><td>{when(c.lastOrderAt)}</td><td><span className={`pill ${c.status === "ACTIVE" ? "ok" : "warn"}`}>{c.status === "ACTIVE" ? "Active" : "Deletion requested"}</span></td></tr>)}
      {data?.length === 0 && <tr><td colSpan={6} className="empty">No customers yet.</td></tr>}{!data && !err && <tr><td colSpan={6} className="empty">Loading…</td></tr>}</tbody></table></div></>);
}
