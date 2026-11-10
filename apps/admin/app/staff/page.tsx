"use client";
import { useState } from "react";
import { adm, msg, when } from "@/lib/api";
import { Modal, PageHead, useAdmin, useLoad } from "@/components/Shell";
interface U { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt: string | null }
const ROLES = [["STAFF", "Staff: orders and returns"], ["MANAGER", "Manager: also stock, products, store operations"], ["OWNER", "Owner: everything, including staff accounts"]];
export default function Staff() {
  const { me, toast } = useAdmin(); const { data, err, reload } = useLoad(() => adm<U[]>("/admin/staff"), []); const [open, setOpen] = useState(false); const [f, setF] = useState({ name: "", email: "", password: "", role: "STAFF" }); const [e, setE] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); setE(""); try { await adm("/admin/staff", { method: "POST", body: f }); toast("Staff account created"); setOpen(false); setF({ name: "", email: "", password: "", role: "STAFF" }); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } };
  const toggle = async (u: U) => { if (!confirm(`${u.isActive ? "Deactivate" : "Reactivate"} ${u.name}?`)) return; try { await adm(`/admin/staff/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }); toast("Updated"); reload(); } catch (x) { toast(msg(x), "err"); } };
  return (<><PageHead title="Staff" sub="Deactivating takes effect immediately."><button className="btn" onClick={() => setOpen(true)}>Add staff member</button></PageHead>{err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Status</th><th /></tr></thead><tbody>
      {data?.map((u) => <tr key={u.id}><td><b>{u.name}</b><small>{u.email}</small></td><td style={{ textTransform: "capitalize" }}>{u.role.toLowerCase()}</td><td>{when(u.lastLoginAt)}</td><td><span className={`pill ${u.isActive ? "ok" : "bad"}`}>{u.isActive ? "Active" : "Deactivated"}</span></td><td className="num">{u.id !== me?.id && <button className="btn sm sec" onClick={() => toggle(u)}>{u.isActive ? "Deactivate" : "Reactivate"}</button>}</td></tr>)}
      {!data && !err && <tr><td colSpan={5} className="empty">Loading…</td></tr>}</tbody></table></div>
    {open && <Modal title="Add staff member" onClose={() => setOpen(false)}><div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label><label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label>Temporary password <small>At least 12 characters. Share it securely.</small><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" /></label>
      <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>{e && <p className="err-box">{e}</p>}
      <div className="mf"><button className="btn sec" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy || !f.name || !f.email || f.password.length < 12} onClick={create}>{busy ? "Creating…" : "Create account"}</button></div></Modal>}</>);
}
