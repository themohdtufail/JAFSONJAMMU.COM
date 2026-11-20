"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { adm, admUpload, admUploadVideo, msg, thumb, type MediaItem } from "@/lib/api";
import { Modal, useAdmin } from "@/components/Shell";

export const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export interface MediaConfig { storage: "DATABASE" | "S3"; videoUpload: boolean; dbUsedMb: number; dbMaxMb: number }

/** A small preview: a picture shows its 320px size; a video shows its cover with a play mark. */
export function Thumb({ m, size = 96 }: { m: Pick<MediaItem, "kind" | "src" | "srcset" | "alt" | "color" | "poster">; size?: number }) {
  const url = m.kind === "VIDEO" ? m.poster : thumb(m);
  return <span className="mthumb" style={{ width: size, height: size, background: m.color ?? "#eee" }}>{url ? <img src={url} alt={m.alt} width={size} height={size} loading="lazy" decoding="async" /> : <span className="mt-novid" aria-hidden>▶</span>}{m.kind === "VIDEO" && <span className="mt-play" aria-hidden>▶</span>}</span>;
}

/** Drop or choose pictures (and videos when storage allows); each is uploaded in turn and reported back as it finishes. */
export function UploadZone({ cfg, onDone, accept = "image" }: { cfg: MediaConfig | null; onDone: (m: MediaItem[]) => void; accept?: "image" | "any" }) {
  const { toast } = useAdmin(); const [rows, setRows] = useState<{ name: string; state: "wait" | "up" | "ok" | "err"; note?: string; pct?: number }[]>([]); const [over, setOver] = useState(false); const input = useRef<HTMLInputElement>(null);
  const go = useCallback(async (files: File[]) => {
    if (!files.length) return; setRows(files.map((f) => ({ name: f.name, state: "wait" }))); const done: MediaItem[] = [];
    for (const [i, f] of files.entries()) {
      const set = (p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); set({ state: "up" });
      try { const isVid = f.type.startsWith("video/"); const m = isVid ? (cfg?.videoUpload ? await admUploadVideo(f, "", (pct) => set({ pct })) : (() => { throw new Error("Video upload needs object storage. Use a video link instead."); })()) : await admUpload(f); done.push(m); set({ state: "ok" }); }
      catch (e) { set({ state: "err", note: msg(e) === "Something went wrong" && e instanceof Error ? e.message : msg(e) }); }
    }
    if (done.length) { toast(`${done.length} uploaded`); onDone(done); }
  }, [cfg, onDone, toast]);
  return (<div>
    <div className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); go([...e.dataTransfer.files]); }}>
      <p><b>Drop pictures here</b> or</p><button className="btn" type="button" onClick={() => input.current?.click()}>Choose files</button>
      <small>JPG, PNG, WebP or AVIF up to 12 MB. We make web-sized copies automatically.{accept === "any" && cfg?.videoUpload ? " MP4 or WebM videos up to 100 MB." : ""}</small>
      <input ref={input} type="file" multiple hidden accept={accept === "any" && cfg?.videoUpload ? "image/*,video/mp4,video/webm" : "image/*"} onChange={(e) => { go([...(e.target.files ?? [])]); e.target.value = ""; }} /></div>
    {rows.length > 0 && <ul className="uplist" aria-live="polite">{rows.map((r, i) => <li key={i} className={r.state}><span>{r.name}</span><b>{r.state === "wait" ? "Waiting" : r.state === "up" ? (r.pct !== undefined ? `Uploading ${r.pct}%` : "Uploading…") : r.state === "ok" ? "Done" : r.note}</b></li>)}</ul>}
  </div>);
}

/** Choose from the library, upload new files, or link to a hosted video. Used wherever a picture is needed. */
export function MediaPicker({ onClose, onPick, multiple = false, kind = "IMAGE", title }: { onClose: () => void; onPick: (m: MediaItem[]) => void; multiple?: boolean; kind?: "IMAGE" | "ANY"; title?: string }) {
  const { toast } = useAdmin(); const [tab, setTab] = useState<"library" | "upload" | "link">("library"); const [items, setItems] = useState<MediaItem[]>([]); const [total, setTotal] = useState(0); const [q, setQ] = useState(""); const [sel, setSel] = useState<MediaItem[]>([]); const [busy, setBusy] = useState(false); const [cfg, setCfg] = useState<MediaConfig | null>(null); const [err, setErr] = useState("");
  const [link, setLink] = useState({ url: "", alt: "", poster: "" });
  const load = useCallback(async (reset: boolean, off = 0) => { try { const r = await adm<{ total: number; items: MediaItem[] }>(`/admin/media?limit=36&offset=${off}${kind === "IMAGE" ? "&kind=IMAGE" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`); setTotal(r.total); setItems((cur) => (reset ? r.items : [...cur, ...r.items])); } catch (e) { setErr(msg(e)); } }, [q, kind]);
  useEffect(() => { const t = setTimeout(() => load(true), q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { adm<MediaConfig>("/admin/media/config").then(setCfg).catch(() => {}); }, []);
  const toggle = (m: MediaItem) => setSel((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : multiple ? [...s, m] : [m]));
  const addLink = async () => { setBusy(true); setErr(""); try { const m = await adm<MediaItem>("/admin/media/external", { method: "POST", body: { url: link.url.trim(), alt: link.alt.trim(), ...(link.poster ? { posterId: link.poster } : {}) } }); toast("Video added"); setSel((s) => (multiple ? [...s, m] : [m])); setItems((i) => [m, ...i]); setTab("library"); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (<Modal title={title ?? (multiple ? "Choose pictures" : "Choose a picture")} onClose={onClose} wide>
    <div className="tabs" role="tablist">{(["library", "upload", ...(kind === "ANY" ? ["link"] : [])] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t as typeof tab)}>{t === "library" ? "Library" : t === "upload" ? "Upload" : "Video link"}</button>)}</div>
    {err && <p className="err-box" role="alert">{err}</p>}
    {tab === "library" && <><div className="filters"><input className="in" placeholder="Search by description…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" /></div>
      <div className="mgrid" role="listbox" aria-multiselectable={multiple}>{items.map((m) => { const on = sel.some((x) => x.id === m.id); return <button key={m.id} role="option" aria-selected={on} className={`mcell ${on ? "on" : ""}`} onClick={() => toggle(m)} onDoubleClick={() => { if (!multiple) onPick([m]); }}><Thumb m={m} size={120} /><small>{m.alt || "No description"}</small>{on && <i className="tick" aria-hidden>✓</i>}</button>; })}</div>
      {items.length === 0 && <p className="empty">Nothing here yet. Use the Upload tab to add pictures.</p>}{items.length < total && <div className="actions" style={{ justifyContent: "center", marginTop: 12 }}><button className="btn sec" onClick={() => load(false, items.length)}>Load more</button></div>}</>}
    {tab === "upload" && <UploadZone cfg={cfg} accept={kind === "ANY" ? "any" : "image"} onDone={(ms) => { setSel((s) => (multiple ? [...s, ...ms] : [ms[0]!])); setItems((i) => [...ms, ...i]); setTab("library"); }} />}
    {tab === "link" && <div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>Video file address <small>An https:// link to an .mp4 or .webm file</small><input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} inputMode="url" /></label><label>Description <small>For people who can't see the video</small><input value={link.alt} onChange={(e) => setLink({ ...link, alt: e.target.value })} maxLength={200} /></label>
      <label>Cover picture <small>Optional. Shown before the video plays</small><select value={link.poster} onChange={(e) => setLink({ ...link, poster: e.target.value })}><option value="">None</option>{items.filter((m) => m.kind === "IMAGE").slice(0, 36).map((m) => <option key={m.id} value={m.id}>{m.alt || m.id.slice(0, 8)}</option>)}</select></label>
      <button className="btn" disabled={busy || !link.url.trim()} onClick={addLink}>{busy ? "Adding…" : "Add video"}</button></div>}
    <div className="mf"><span style={{ marginRight: "auto", color: "var(--mute)", fontSize: 14 }}>{sel.length ? `${sel.length} selected` : ""}</span><button className="btn sec" onClick={onClose}>Cancel</button><button className="btn" disabled={!sel.length} onClick={() => onPick(sel)}>{multiple ? `Use ${sel.length || ""} selected` : "Use this picture"}</button></div>
  </Modal>);
}
