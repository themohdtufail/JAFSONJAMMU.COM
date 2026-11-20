"use client";
import { useState } from "react";
import { adm, msg, thumb, type MediaItem } from "@/lib/api";
import { Modal, PageHead, useAdmin, useLoad } from "@/components/Shell";
import { MediaPicker } from "@/components/Media";

interface C { slug: string; name: string; collection: "men" | "kids"; sortOrder: number; isActive: boolean; imageUrl: string | null; products: number }
export default function Categories() {
  const { can, toast } = useAdmin(); const { data, err, reload } = useLoad(() => (can("MANAGER") ? adm<C[]>("/admin/categories") : Promise.resolve([] as C[])), []);
  const [add, setAdd] = useState(false); const [f, setF] = useState({ name: "", collection: "men" as "men" | "kids" }); const [pick, setPick] = useState<string | null>(null); const [e, setE] = useState(""); const [busy, setBusy] = useState(false);
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can manage categories.</div>;
  const patch = async (c: C, body: object, ok: string) => { try { await adm(`/admin/categories/${c.slug}`, { method: "PATCH", body }); toast(ok); reload(); } catch (x) { toast(msg(x), "err"); } };
  const create = async () => { setBusy(true); setE(""); try { await adm("/admin/categories", { method: "POST", body: f }); toast("Category created"); setAdd(false); setF({ name: "", collection: "men" }); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } };
  const del = async (c: C) => { if (!confirm(`Delete "${c.name}"?`)) return; try { await adm(`/admin/categories/${c.slug}`, { method: "DELETE" }); toast("Deleted"); reload(); } catch (x) { toast(msg(x), "err"); } };
  const groups = (["men", "kids"] as const).map((k) => [k, (data ?? []).filter((c) => c.collection === k)] as const);
  return (<><PageHead title="Categories" sub="How products are grouped in the shop. Hide a category to take it off the shop without deleting it."><button className="btn" onClick={() => { setAdd(true); setE(""); }}>New category</button></PageHead>
    {err && <div className="err-box">{err}</div>}
    {groups.map(([k, list]) => (<div key={k} style={{ marginBottom: 24 }}><h2 style={{ font: "600 12px var(--sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mute)", marginBottom: 12 }}>{k === "men" ? "Men" : "Kids"}</h2>
      <div className="tbl"><table><thead><tr><th>Category</th><th className="num">Products</th><th className="num">Order</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead><tbody>
        {list.map((c) => (<tr key={c.slug}><td><div style={{ display: "flex", alignItems: "center", gap: 12 }}>{c.imageUrl ? <img src={c.imageUrl.includes("/media/") ? c.imageUrl.replace(/\/\d+\.webp$/, "/320.webp") : c.imageUrl} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover" }} loading="lazy" /> : <span className="mthumb" style={{ width: 44, height: 44, background: "#eee" }} />}<b>{c.name}</b></div></td>
          <td className="num">{c.products}</td><td className="num"><span style={{ display: "inline-flex", gap: 4 }}><button className="btn sm sec" aria-label={`Move ${c.name} up`} onClick={() => patch(c, { sortOrder: Math.max(0, c.sortOrder - 1) }, "Moved")}>↑</button><button className="btn sm sec" aria-label={`Move ${c.name} down`} onClick={() => patch(c, { sortOrder: c.sortOrder + 1 }, "Moved")}>↓</button></span></td>
          <td><span className={`pill ${c.isActive ? "ok" : "warn"}`}>{c.isActive ? "Shown" : "Hidden"}</span></td>
          <td className="num"><div className="actions" style={{ justifyContent: "flex-end" }}><button className="btn sm sec" onClick={() => setPick(c.slug)}>Picture</button><button className="btn sm sec" onClick={() => patch(c, { isActive: !c.isActive }, c.isActive ? "Hidden from the shop" : "Shown in the shop")}>{c.isActive ? "Hide" : "Show"}</button><button className="btn sm sec" disabled={c.products > 0} title={c.products ? "Move its products first" : ""} onClick={() => del(c)}>Delete</button></div></td></tr>))}
        {list.length === 0 && <tr><td colSpan={5} className="empty">None yet.</td></tr>}</tbody></table></div></div>))}
    {add && <Modal title="New category" onClose={() => setAdd(false)}><div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>Name<input value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} maxLength={40} autoFocus /></label><label>Section<select value={f.collection} onChange={(ev) => setF({ ...f, collection: ev.target.value as "men" | "kids" })}><option value="men">Men</option><option value="kids">Kids</option></select></label></div>{e && <p className="err-box" role="alert">{e}</p>}<div className="mf"><button className="btn sec" onClick={() => setAdd(false)}>Cancel</button><button className="btn" disabled={busy || f.name.trim().length < 2} onClick={create}>{busy ? "Saving…" : "Create"}</button></div></Modal>}
    {pick && <MediaPicker onClose={() => setPick(null)} onPick={(ms: MediaItem[]) => { const c = (data ?? []).find((x) => x.slug === pick)!; setPick(null); patch(c, { mediaId: ms[0]!.id }, "Picture set"); }} title="Category picture" />}</>);
}
