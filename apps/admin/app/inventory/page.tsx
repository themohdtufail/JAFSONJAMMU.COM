"use client";
import { useEffect, useState } from "react";
import { adm, label, msg, when } from "@/lib/api";
import { Modal, PageHead, useAdmin, useLoad } from "@/components/Shell";

interface Row { sku: string; product: string; colour: string; size: string; onHand: number; reserved: number; safetyStock: number; available: number }
interface Mv { id: string; createdAt: string; movementType: string; quantityDelta: number; referenceId: string; sourceSystem: string; actor: string | null; reason: string | null }

export default function Inventory() {
  const { can, toast } = useAdmin(); const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [low, setLow] = useState(false);
  const [adj, setAdj] = useState<Row | null>(null); const [val, setVal] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [mv, setMv] = useState<Row | null>(null);
  useEffect(() => { const p = new URLSearchParams(location.search).get("q"); if (p) setQ(p); }, []);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err: lerr, reload } = useLoad(() => adm<Row[]>(`/admin/inventory${dq ? `?q=${encodeURIComponent(dq)}` : ""}`), [dq]);
  const moves = useLoad(() => (mv ? adm<Mv[]>(`/admin/inventory/movements?sku=${mv.sku}`) : Promise.resolve([] as Mv[])), [mv?.sku]);
  const rows = (data ?? []).filter((r) => !low || r.available <= 3);
  const save = async () => {
    if (!adj) return; setBusy(true); setErr("");
    try { await adm("/admin/inventory/adjustments", { method: "POST", body: { sku: adj.sku, newOnHand: Number(val), reason } }); toast(`${adj.sku} updated`); setAdj(null); reload(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  return (<>
    <PageHead title="Inventory" sub="Physical = on the shelf. Available = physical − reserved for open orders − safety stock." />
    <div className="filters"><input className="in" placeholder="Search SKU or product…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" /><label className="chk"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only (≤ 3)</label></div>
    {lerr && <div className="err-box">{lerr}</div>}
    <div className="tbl"><table><thead><tr><th>SKU</th><th>Product</th><th>Variant</th><th className="num">Physical</th><th className="num">Reserved</th><th className="num">Available</th><th /></tr></thead><tbody>
      {rows.map((r) => (<tr key={r.sku}><td><b>{r.sku}</b></td><td>{r.product}</td><td>{r.colour} · {r.size}</td><td className="num">{r.onHand}</td><td className="num">{r.reserved || "—"}</td>
        <td className="num"><span className={`pill ${r.available === 0 ? "bad" : r.available <= 3 ? "warn" : "ok"}`}>{r.available}</span></td>
        <td className="num"><div className="actions" style={{ justifyContent: "flex-end" }}><button className="btn sm sec" onClick={() => setMv(r)}>History</button>{can("MANAGER") && <button className="btn sm" onClick={() => { setAdj(r); setVal(String(r.onHand)); setReason(""); setErr(""); }}>Adjust</button>}</div></td></tr>))}
      {data && rows.length === 0 && <tr><td colSpan={7} className="empty">Nothing found.</td></tr>}{!data && !lerr && <tr><td colSpan={7} className="empty">Loading…</td></tr>}</tbody></table></div>
    {adj && <Modal title={`Adjust ${adj.sku}`} onClose={() => setAdj(null)}>
      <p style={{ marginBottom: 14, color: "var(--ink2)" }}>{adj.product} · {adj.colour} · {adj.size}<br />Currently {adj.onHand} on the shelf, {adj.reserved} reserved for orders.</p>
      <div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>New physical count<input type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} autoFocus /></label><label>Reason (recorded in the audit log)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock count, damaged, new delivery" /></label></div>
      {err && <p className="err-box">{err}</p>}<div className="mf"><button className="btn sec" onClick={() => setAdj(null)}>Cancel</button><button className="btn" disabled={busy || val === "" || reason.trim().length < 3 || Number(val) < 0} onClick={save}>{busy ? "Saving…" : "Save adjustment"}</button></div></Modal>}
    {mv && <Modal title={`${mv.sku} history`} onClose={() => setMv(null)} wide>
      <div className="tbl"><table><thead><tr><th>When</th><th>Type</th><th className="num">Change</th><th>Source</th><th>Reference</th></tr></thead><tbody>
        {moves.data?.map((m) => <tr key={m.id}><td>{when(m.createdAt)}</td><td>{label(m.movementType)}</td><td className="num"><b style={{ color: m.quantityDelta < 0 ? "var(--bad)" : "var(--ok)" }}>{m.quantityDelta > 0 ? "+" : ""}{m.quantityDelta}</b></td><td>{label(m.sourceSystem)}{m.actor ? ` · ${m.actor}` : ""}</td><td>{m.referenceId}{m.reason ? <small>{m.reason}</small> : null}</td></tr>)}
        {moves.data?.length === 0 && <tr><td colSpan={5} className="empty">No movements yet.</td></tr>}</tbody></table></div><p style={{ marginTop: 10, color: "var(--mute)", fontSize: 12 }}>Reserve and release rows show changes to reserved units; others change physical stock. This history cannot be edited.</p></Modal>}
  </>);
}
