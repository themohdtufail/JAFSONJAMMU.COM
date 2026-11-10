"use client";
import { useState } from "react";
import { adm, label, msg, when } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface S { counts: Record<string, number>; lastEventAt: string | null; quarantined: { eventId: string; eventType: string; quarantineReason: string; detail: string | null; attempts: number; receivedAt: string }[] }
const HELP: Record<string, string> = { UNKNOWN_SKU: "The POS sold an item whose SKU isn't in the catalogue. Add or map the SKU, then retry.", STOCK_CONFLICT: "Applying this would take stock below what's reserved for online orders. Check the shelf count and adjust stock, then retry.", UNKNOWN_LOCATION: "The event named a location this system doesn't know.", INVALID_SCHEMA: "The event didn't match the agreed format. Fix it at the source in Bill OS." };

export default function StoreOps() {
  const { toast } = useAdmin(); const { data, err, reload } = useLoad(() => adm<S>("/admin/integration/status"), []); const [busy, setBusy] = useState("");
  const retry = async (id: string) => { setBusy(id); try { const r = await adm<{ status: string; reason?: string }>(`/admin/integration/events/${id}/retry`, { method: "POST" }); toast(r.status === "APPLIED" ? "Event applied" : `Still ${label(r.status).toLowerCase()}${r.reason ? `: ${label(r.reason)}` : ""}`, r.status === "APPLIED" ? "ok" : "err"); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); } };
  const c = data?.counts ?? {}; const q = c.QUARANTINED ?? 0;
  return (<><PageHead title="Store operations" sub="Showroom POS (Bill OS) synchronisation. Nothing is dropped silently: failed events wait here." />
    {err && <div className="err-box">{err}</div>}{!data && !err && <div className="empty">Loading…</div>}
    {data && <>
      <div className="grid4"><div className="card kpi"><h3>Last event received</h3><b style={{ fontSize: 24 }}>{data.lastEventAt ? when(data.lastEventAt) : "None yet"}</b><span>{data.lastEventAt ? "From the showroom POS" : "Bill OS hasn't sent anything"}</span></div>
        <div className="card kpi"><h3>Applied</h3><b>{c.APPLIED ?? 0}</b><span>Events synced to stock</span></div><div className="card kpi"><h3>Needs attention</h3><b style={{ color: q ? "var(--accent)" : undefined }}>{q}</b><span>Quarantined events</span></div><div className="card kpi"><h3>In progress</h3><b>{c.PROCESSING ?? 0}</b><span>Should normally be 0</span></div></div>
      <h3 style={{ margin: "28px 0 12px", font: "600 11px var(--sans)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--mute)" }}>Quarantined events</h3>
      <div className="tbl"><table><thead><tr><th>Received</th><th>Event</th><th>Problem</th><th className="num">Tries</th><th /></tr></thead><tbody>
        {data.quarantined.map((e) => (<tr key={e.eventId}><td>{when(e.receivedAt)}</td><td><b>{label(e.eventType)}</b><small>{e.eventId}</small></td><td><span className="pill bad">{label(e.quarantineReason)}</span><small>{e.detail}</small><small>{HELP[e.quarantineReason]}</small></td><td className="num">{e.attempts}</td><td className="num"><button className="btn sm" disabled={busy === e.eventId} onClick={() => retry(e.eventId)}>{busy === e.eventId ? "Retrying…" : "Retry"}</button></td></tr>))}
        {data.quarantined.length === 0 && <tr><td colSpan={5} className="empty">All clear. No events are waiting.</td></tr>}</tbody></table></div></>}</>);
}
