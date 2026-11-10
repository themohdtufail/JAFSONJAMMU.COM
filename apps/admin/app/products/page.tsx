"use client";
import { useState } from "react";
import { adm, inr, msg } from "@/lib/api";
import { Modal, PageHead, useAdmin, useLoad } from "@/components/Shell";

interface P { slug: string; name: string; collection: string; category: string; status: string; isNew: boolean; isBest: boolean; image: string | null; pricePaise: number; compareAtPaise: number | null; variants: number; available: number; description: string }
const blank = { name: "", collection: "men", category: "", description: "", fabric: "", fit: "", price: "", compare: "", gst: "5", images: "", colours: "Black:#1d1d1d", sizes: "S, M, L, XL", stock: "5", status: "DRAFT" };

export default function Products() {
  const { can, toast } = useAdmin(); const { data, err, reload } = useLoad(() => adm<P[]>("/admin/products"), []);
  const [edit, setEdit] = useState<P | null>(null); const [price, setPrice] = useState(""); const [cmp, setCmp] = useState(""); const [creating, setCreating] = useState(false); const [f, setF] = useState(blank); const [busy, setBusy] = useState(false); const [e, setE] = useState("");
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = async (p: P) => { try { await adm(`/admin/products/${p.slug}`, { method: "PATCH", body: { status: p.status === "ACTIVE" ? "DRAFT" : "ACTIVE" } }); toast(p.status === "ACTIVE" ? "Hidden from the shop" : "Published to the shop"); reload(); } catch (x) { toast(msg(x), "err"); } };
  const saveEdit = async () => {
    if (!edit) return; setBusy(true); setE("");
    try { await adm(`/admin/products/${edit.slug}`, { method: "PATCH", body: { pricePaise: Math.round(Number(price) * 100), compareAtPaise: cmp ? Math.round(Number(cmp) * 100) : null } }); toast("Prices updated"); setEdit(null); reload(); } catch (x) { setE(msg(x)); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setE("");
    try {
      const colours = f.colours.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, hex] = l.split(":").map((s) => s.trim()); return { name: name ?? "", hex: hex ?? "" }; });
      await adm("/admin/products", { method: "POST", body: { name: f.name.trim(), collection: f.collection, category: f.category.trim(), description: f.description.trim(), fabric: f.fabric.trim(), fit: f.fit.trim(), pricePaise: Math.round(Number(f.price) * 100), compareAtPaise: f.compare ? Math.round(Number(f.compare) * 100) : null, gstRateBps: Math.round(Number(f.gst) * 100), images: f.images.split("\n").map((s) => s.trim()).filter(Boolean), colours, sizes: f.sizes.split(",").map((s) => s.trim()).filter(Boolean), initialStock: Number(f.stock), status: f.status } });
      toast(f.status === "ACTIVE" ? "Product published" : "Product saved as draft"); setCreating(false); setF(blank); reload();
    } catch (x) { setE(msg(x)); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof blank) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });
  return (<>
    <PageHead title="Products" sub="Drafts are hidden from the shop until published.">{can("MANAGER") && <button className="btn" onClick={() => { setCreating(true); setE(""); }}>New product</button>}</PageHead>
    <div className="filters"><input className="in" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" /></div>
    {err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th /><th>Product</th><th>Status</th><th className="num">Price</th><th className="num">Variants</th><th className="num">Available</th><th /></tr></thead><tbody>
      {rows.map((p) => (<tr key={p.slug}><td style={{ width: 56 }}>{p.image && <img className="thumb" src={p.image} alt="" />}</td><td><b>{p.name}</b><small>{p.collection === "men" ? "Men" : "Kids"} · {p.category}</small></td><td><span className={`pill ${p.status === "ACTIVE" ? "ok" : "warn"}`}>{p.status === "ACTIVE" ? "Published" : "Draft"}</span></td>
        <td className="num">{inr(p.pricePaise)}{p.compareAtPaise && <small><s>{inr(p.compareAtPaise)}</s></small>}</td><td className="num">{p.variants}</td><td className="num"><span className={`pill ${p.available === 0 ? "bad" : p.available <= 12 ? "warn" : "ok"}`}>{p.available}</span></td>
        <td className="num">{can("MANAGER") && <div className="actions" style={{ justifyContent: "flex-end" }}><button className="btn sm sec" onClick={() => { setEdit(p); setPrice(String(p.pricePaise / 100)); setCmp(p.compareAtPaise ? String(p.compareAtPaise / 100) : ""); setE(""); }}>Edit price</button><button className="btn sm" onClick={() => toggle(p)}>{p.status === "ACTIVE" ? "Unpublish" : "Publish"}</button></div>}</td></tr>))}
      {data && rows.length === 0 && <tr><td colSpan={7} className="empty">No products.</td></tr>}{!data && !err && <tr><td colSpan={7} className="empty">Loading…</td></tr>}</tbody></table></div>
    {edit && <Modal title={edit.name} onClose={() => setEdit(null)}><div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>Selling price (₹, GST included)<input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} autoFocus /></label><label>Compare-at price (₹) <small>Optional. Shown struck through, must be higher.</small><input type="number" min={1} value={cmp} onChange={(e) => setCmp(e.target.value)} /></label></div>
      <p style={{ marginTop: 10, color: "var(--mute)", fontSize: 12 }}>Applies to every colour and size. Orders already placed keep the price they paid.</p>{e && <p className="err-box">{e}</p>}
      <div className="mf"><button className="btn sec" onClick={() => setEdit(null)}>Cancel</button><button className="btn" disabled={busy || !price} onClick={saveEdit}>{busy ? "Saving…" : "Save prices"}</button></div></Modal>}
    {creating && <Modal title="New product" onClose={() => setCreating(false)} wide><div className="fields">
      <label className="w2">Name<input value={f.name} onChange={set("name")} placeholder="e.g. Linen Camp-Collar Shirt" autoFocus /></label>
      <label>Collection<select value={f.collection} onChange={set("collection")}><option value="men">Men</option><option value="kids">Kids</option></select></label><label>Category<input value={f.category} onChange={set("category")} placeholder="Shirts, Jackets, T-Shirts…" /></label>
      <label className="w2">Description<textarea value={f.description} onChange={set("description")} /></label>
      <label>Fabric<input value={f.fabric} onChange={set("fabric")} placeholder="100% cotton" /></label><label>Fit<input value={f.fit} onChange={set("fit")} placeholder="Regular fit" /></label>
      <label>Selling price (₹, GST included)<input type="number" min={1} value={f.price} onChange={set("price")} /></label><label>Compare-at price (₹, optional)<input type="number" min={1} value={f.compare} onChange={set("compare")} /></label>
      <label>GST rate (%) <small>Confirm with your accountant</small><input type="number" min={0} max={28} step={0.5} value={f.gst} onChange={set("gst")} /></label><label>Opening stock per size and colour<input type="number" min={0} value={f.stock} onChange={set("stock")} /></label>
      <label className="w2">Image URLs <small>One per line, https only. The first is the main photo.</small><textarea value={f.images} onChange={set("images")} placeholder="https://…" /></label>
      <label>Colours <small>One per line as Name:#hex</small><textarea value={f.colours} onChange={set("colours")} /></label><label>Sizes <small>Comma separated, e.g. S, M, L or 2-3Y, 4-5Y</small><textarea value={f.sizes} onChange={set("sizes")} /></label>
      <label>Status<select value={f.status} onChange={set("status")}><option value="DRAFT">Save as draft</option><option value="ACTIVE">Publish now</option></select></label></div>
      {e && <p className="err-box">{e}</p>}<div className="mf"><button className="btn sec" onClick={() => setCreating(false)}>Cancel</button><button className="btn" disabled={busy || !f.name || !f.category || !f.price || !f.images} onClick={create}>{busy ? "Creating…" : "Create product"}</button></div></Modal>}
  </>);
}
