"use client";
import { useCallback, useEffect, useState } from "react";
import { adm, msg, type MediaItem } from "@/lib/api";
import { PageHead, useAdmin } from "@/components/Shell";
import { mb, Thumb, UploadZone, type MediaConfig } from "@/components/Media";

export default function MediaLibrary() {
  const { can, toast } = useAdmin(); const [items, setItems] = useState<MediaItem[]>([]); const [total, setTotal] = useState(0); const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [cfg, setCfg] = useState<MediaConfig | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async (reset: boolean, off = 0) => { try { const r = await adm<{ total: number; items: MediaItem[] }>(`/admin/media?limit=36&offset=${off}${kind ? `&kind=${kind}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`); setTotal(r.total); setItems((c) => (reset ? r.items : [...c, ...r.items])); setErr(""); } catch (e) { setErr(msg(e)); } }, [q, kind]);
  useEffect(() => { if (!can("MANAGER")) return; const t = setTimeout(() => load(true), q ? 250 : 0); return () => clearTimeout(t); }, [load, q, can]);
  useEffect(() => { if (can("MANAGER")) adm<MediaConfig>("/admin/media/config").then(setCfg).catch(() => {}); }, [can, items.length]);
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can manage the media library.</div>;
  const saveAlt = async (m: MediaItem, alt: string) => { if (alt === m.alt) return; try { await adm(`/admin/media/${m.id}`, { method: "PATCH", body: { alt } }); setItems((c) => c.map((x) => (x.id === m.id ? { ...x, alt } : x))); toast("Description saved"); } catch (e) { toast(msg(e), "err"); } };
  const del = async (m: MediaItem) => { if (!confirm("Delete this from the library? This can't be undone.")) return; setBusy(m.id); try { await adm(`/admin/media/${m.id}`, { method: "DELETE" }); setItems((c) => c.filter((x) => x.id !== m.id)); setTotal((t) => t - 1); toast("Deleted"); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); } };
  const pct = cfg && cfg.storage === "DATABASE" ? Math.min(100, Math.round((cfg.dbUsedMb / cfg.dbMaxMb) * 100)) : 0;
  return (<><PageHead title="Media library" sub="Pictures and videos for products, banners and categories. Every picture is resized automatically, so pages load fast on any connection." />
    {err && <div className="err-box">{err}</div>}
    {cfg && <div className={pct >= 80 ? "err-box" : "card"} style={{ marginBottom: 16 }} role="status"><b>{cfg.storage === "S3" ? "Object storage is connected." : "Pictures are stored in the shop's database."}</b>{" "}{cfg.storage === "S3" ? "Pictures and videos have unlimited room and load from a fast global network." : `${cfg.dbUsedMb} of ${cfg.dbMaxMb} MB used (${pct}%). For videos and unlimited pictures, connect Cloudflare R2 or Supabase Storage (see the setup notes).`}</div>}
    <div className="card" style={{ marginBottom: 16 }}><UploadZone cfg={cfg} accept="any" onDone={(ms) => { setItems((c) => [...ms, ...c]); setTotal((t) => t + ms.length); }} /></div>
    <div className="filters"><input className="in" placeholder="Search by description…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /><select className="in" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">Pictures and videos</option><option value="IMAGE">Pictures</option><option value="VIDEO">Videos</option></select><span style={{ color: "var(--mute)", fontSize: 14 }}>{total} items</span></div>
    <div className="mlist">{items.map((m) => (<div className="mcard" key={m.id}><Thumb m={m} size={180} />
      <label className="sr" htmlFor={`a${m.id}`}>Description</label><input id={`a${m.id}`} className="in" defaultValue={m.alt} placeholder="Describe it (helps search and screen readers)" maxLength={200} onBlur={(e) => saveAlt(m, e.target.value.trim())} />
      <small>{m.kind === "VIDEO" ? "Video" : `${m.width}×${m.height}`} · {m.kind === "VIDEO" && !m.bytes ? "linked" : mb(m.bytes)}</small>
      <div className="actions"><button className="btn sm sec" onClick={() => { navigator.clipboard?.writeText(m.src.startsWith("http") ? m.src : location.origin.replace("jafson-admin", "jafson") + m.src); toast("Link copied"); }}>Copy link</button><button className="btn sm sec" disabled={busy === m.id} onClick={() => del(m)}>Delete</button></div></div>))}</div>
    {items.length === 0 && !err && <p className="empty">The library is empty. Upload your first pictures above.</p>}{items.length < total && <div className="actions" style={{ justifyContent: "center", marginTop: 16 }}><button className="btn sec" onClick={() => load(false, items.length)}>Load more</button></div>}</>);
}
