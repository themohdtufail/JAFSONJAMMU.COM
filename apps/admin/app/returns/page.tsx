"use client";
import Link from "next/link";
import { useState } from "react";
import { adm, inr, label, msg, tone, when } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface R { ref: string; status: string; createdAt: string; refundSuggestionPaise: number; order: { number: string; contactName: string; contactPhone: string; paymentMethod: string; paymentStatus: string }; items: { id: string; kind: string; reason: string; exchangeSize: string | null; orderItem: { productName: string; size: string; colour: string; quantity: number } }[] }

export default function Returns() {
  const { toast } = useAdmin(); const { data, err, reload } = useLoad(() => adm<R[]>("/admin/returns"), []); const [busy, setBusy] = useState("");
  const decide = async (ref: string, decision: "APPROVED" | "REJECTED") => {
    if (!confirm(`${decision === "APPROVED" ? "Approve" : "Reject"} return ${ref}?`)) return; setBusy(ref);
    try { await adm(`/admin/returns/${ref}/decision`, { method: "POST", body: { decision } }); toast(`Return ${decision.toLowerCase()}`); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); }
  };
  const receive = async (ref: string, restock: boolean) => {
    if (!confirm(restock ? `Mark ${ref} received and put the items back in sellable stock?` : `Mark ${ref} received as damaged? Stock will not change.`)) return; setBusy(ref);
    try { await adm(`/admin/returns/${ref}/receive`, { method: "POST", body: { restock } }); toast(restock ? "Received and restocked" : "Received, not restocked"); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); }
  };
  return (<>
    <PageHead title="Returns & exchanges" sub="Approve, then mark received when the goods are back. Resellable items return to stock. Refund the customer from the order." />
    {err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Request</th><th>Customer</th><th>Items</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead><tbody>
      {data?.map((r) => (<tr key={r.ref}><td><b>{r.ref}</b><small>{when(r.createdAt)}</small><small><Link className="link" href={`/orders/${r.order.number}`}>{r.order.number}</Link></small></td><td>{r.order.contactName}<small>{r.order.contactPhone}</small></td>
        <td>{r.items.map((i) => <div key={i.id} style={{ marginBottom: 6 }}>{i.orderItem.productName} <span style={{ color: "var(--mute)" }}>({i.orderItem.colour}, {i.orderItem.size})</span><small>{i.kind === "EXCHANGE" ? `Exchange to ${i.exchangeSize}` : "Refund"} · {i.reason}</small></div>)}</td>
        <td><span className={`pill ${tone(r.status === "APPROVED" ? "DELIVERED" : r.status)}`}>{label(r.status)}</span></td>
        <td className="num"><div className="actions" style={{ justifyContent: "flex-end" }}>
          {r.status === "REQUESTED" && <><button className="btn sm danger" disabled={busy === r.ref} onClick={() => decide(r.ref, "REJECTED")}>Reject</button><button className="btn sm" disabled={busy === r.ref} onClick={() => decide(r.ref, "APPROVED")}>Approve</button></>}
          {r.status === "APPROVED" && <><button className="btn sm sec" disabled={busy === r.ref} onClick={() => receive(r.ref, false)}>Received, damaged</button><button className="btn sm" disabled={busy === r.ref} onClick={() => receive(r.ref, true)}>Received, restock</button></>}
          {r.status === "RECEIVED" && r.refundSuggestionPaise > 0 && <Link className="btn sm" href={`/orders/${r.order.number}`}>{r.order.paymentMethod === "COD" ? `Refund ${inr(r.refundSuggestionPaise)} manually` : `Refund ${inr(r.refundSuggestionPaise)}`}</Link>}</div></td>
      </tr>))}
      {data?.length === 0 && <tr><td colSpan={5} className="empty">No return requests.</td></tr>}{!data && !err && <tr><td colSpan={5} className="empty">Loading…</td></tr>}</tbody></table></div></>);
}
