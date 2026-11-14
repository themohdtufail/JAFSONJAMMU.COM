"use client";
import { useState } from "react";
import { adm, inr, label, msg, when } from "@/lib/api";
import { Modal, PageHead, useAdmin, useLoad } from "@/components/Shell";

interface C { code: string; description: string; kind: "PERCENT" | "FLAT"; value: number; minSubtotalPaise: number; maxDiscountPaise: number | null; startsAt: string | null; endsAt: string | null; usageLimit: number | null; perPhoneLimit: number; isActive: boolean; used: number; discountGivenPaise: number }
const blank = { code: "", description: "", kind: "PERCENT", value: "10", min: "0", max: "", limit: "", perPhone: "1", ends: "" };
const status = (c: C) => (!c.isActive ? ["Paused", "warn"] : c.endsAt && new Date(c.endsAt) < new Date() ? ["Expired", "bad"] : c.startsAt && new Date(c.startsAt) > new Date() ? ["Scheduled", "warn"] : c.usageLimit !== null && c.used >= c.usageLimit ? ["Used up", "bad"] : ["Live", "ok"]) as [string, string];

export default function Promotions() {
  const { can, toast } = useAdmin(); const { data, err, reload } = useLoad(() => (can("MANAGER") ? adm<C[]>("/admin/coupons") : Promise.resolve([] as C[])), []);
  const [open, setOpen] = useState(false); const [f, setF] = useState(blank); const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  const set = (k: keyof typeof blank) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: ev.target.value });
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can manage promotions.</div>;
  const create = async () => {
    setBusy(true); setE("");
    try {
      await adm("/admin/coupons", { method: "POST", body: { code: f.code, description: f.description, kind: f.kind, value: f.kind === "PERCENT" ? Math.round(Number(f.value) * 100) : Math.round(Number(f.value) * 100), minSubtotalPaise: Math.round(Number(f.min || 0) * 100), maxDiscountPaise: f.max ? Math.round(Number(f.max) * 100) : null, usageLimit: f.limit ? Number(f.limit) : null, perPhoneLimit: Number(f.perPhone || 1), endsAt: f.ends ? new Date(`${f.ends}T23:59:59+05:30`).toISOString() : null } });
      toast("Coupon created"); setOpen(false); setF(blank); reload();
    } catch (x) { setE(msg(x)); } finally { setBusy(false); }
  };
  const toggle = async (c: C) => { try { await adm(`/admin/coupons/${c.code}`, { method: "PATCH", body: { isActive: !c.isActive } }); toast(c.isActive ? "Coupon paused" : "Coupon resumed"); reload(); } catch (x) { toast(msg(x), "err"); } };
  return (<><PageHead title="Promotions" sub="Discount codes. The discount comes off the price customers pay, and GST follows the reduced price."><button className="btn" onClick={() => { setOpen(true); setE(""); }}>New coupon</button></PageHead>
    {err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Code</th><th>Offer</th><th>Rules</th><th className="num">Used</th><th className="num">Given</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead><tbody>
      {(data ?? []).map((c) => { const [st, tone] = status(c); return (<tr key={c.code}><td><b>{c.code}</b><small>{c.description}</small></td><td>{c.kind === "PERCENT" ? `${c.value / 100}% off` : `${inr(c.value)} off`}{c.maxDiscountPaise ? <small>up to {inr(c.maxDiscountPaise)}</small> : null}</td>
        <td><small>{c.minSubtotalPaise ? `Min ${inr(c.minSubtotalPaise)} · ` : ""}{c.perPhoneLimit}× per customer{c.usageLimit ? ` · ${c.usageLimit} total` : ""}{c.endsAt ? ` · ends ${when(c.endsAt)}` : ""}</small></td><td className="num">{c.used}</td><td className="num">{inr(c.discountGivenPaise)}</td><td><span className={`pill ${tone}`}>{label(st)}</span></td>
        <td className="num"><button className="btn sm sec" onClick={() => toggle(c)}>{c.isActive ? "Pause" : "Resume"}</button></td></tr>); })}
      {data?.length === 0 && <tr><td colSpan={7} className="empty">No coupons yet.</td></tr>}{!data && !err && <tr><td colSpan={7} className="empty">Loading…</td></tr>}</tbody></table></div>
    {open && <Modal title="New coupon" onClose={() => setOpen(false)}><div className="fields" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <label>Code<input value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} autoFocus /></label>
      <label>What customers see<input value={f.description} onChange={set("description")} placeholder="10% off your first order" maxLength={120} /></label>
      <label>Type<select value={f.kind} onChange={set("kind")}><option value="PERCENT">Percentage off</option><option value="FLAT">Fixed amount off</option></select></label>
      <label>{f.kind === "PERCENT" ? "Percent (max 90)" : "Amount (₹)"}<input type="number" min={1} step={f.kind === "PERCENT" ? 0.5 : 1} value={f.value} onChange={set("value")} /></label>
      <label>Minimum order (₹)<input type="number" min={0} value={f.min} onChange={set("min")} /></label><label>Cap on discount (₹) <small>Optional</small><input type="number" min={1} value={f.max} onChange={set("max")} /></label>
      <label>Total uses <small>Optional</small><input type="number" min={1} value={f.limit} onChange={set("limit")} /></label><label>Uses per customer<input type="number" min={1} value={f.perPhone} onChange={set("perPhone")} /></label>
      <label>Last day <small>Optional</small><input type="date" value={f.ends} onChange={set("ends")} /></label></div>
      {e && <p className="err-box" role="alert">{e}</p>}<div className="mf"><button className="btn sec" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy || f.code.length < 3 || f.description.trim().length < 3} onClick={create}>{busy ? "Saving…" : "Create coupon"}</button></div></Modal>}</>);
}
