"use client";
import Link from "next/link";
import { useState } from "react";
import { adm, label, msg, tone, when } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface R { ref: string; status: string; createdAt: string; order: { number: string; contactName: string; contactPhone: string }; items: { id: string; kind: string; reason: string; exchangeSize: string | null; orderItem: { productName: string; size: string; colour: string; quantity: number } }[] }

export default function Returns() {
  const { toast } = useAdmin(); const { data, err, reload } = useLoad(() => adm<R[]>("/admin/returns"), []); const [busy, setBusy] = useState("");
  const decide = async (ref: string, decision: "APPROVED" | "REJECTED") => {
    if (!confirm(`${decision === "APPROVED" ? "Approve" : "Reject"} return ${ref}?`)) return; setBusy(ref);
    try { await adm(`/admin/returns/${ref}/decision`, { method: "POST", body: { decision } }); toast(`Return ${decision.toLowerCase()}`); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); }
  };
  return (<>
    <PageHead title="Returns & exchanges" sub="Approving records the decision. Refunds and restocking are done manually for now." />
    {err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Request</th><th>Customer</th><th>Items</th><th>Status</th><th /></tr></thead><tbody>
      {data?.map((r) => (<tr key={r.ref}><td><b>{r.ref}</b><small>{when(r.createdAt)}</small><small><Link className="link" href={`/orders/${r.order.number}`}>{r.order.number}</Link></small></td><td>{r.order.contactName}<small>{r.order.contactPhone}</small></td>
        <td>{r.items.map((i) => <div key={i.id} style={{ marginBottom: 6 }}>{i.orderItem.productName} <span style={{ color: "var(--mute)" }}>({i.orderItem.colour}, {i.orderItem.size})</span><small>{i.kind === "EXCHANGE" ? `Exchange to ${i.exchangeSize}` : "Refund"} · {i.reason}</small></div>)}</td>
        <td><span className={`pill ${tone(r.status === "APPROVED" ? "DELIVERED" : r.status)}`}>{label(r.status)}</span></td>
        <td className="num">{r.status === "REQUESTED" && <div className="actions" style={{ justifyContent: "flex-end" }}><button className="btn sm danger" disabled={busy === r.ref} onClick={() => decide(r.ref, "REJECTED")}>Reject</button><button className="btn sm" disabled={busy === r.ref} onClick={() => decide(r.ref, "APPROVED")}>Approve</button></div>}</td></tr>))}
      {data?.length === 0 && <tr><td colSpan={5} className="empty">No return requests.</td></tr>}{!data && !err && <tr><td colSpan={5} className="empty">Loading…</td></tr>}</tbody></table></div></>);
}
