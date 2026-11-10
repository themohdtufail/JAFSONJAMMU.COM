"use client";
import Link from "next/link";
import { useState } from "react";
import { inr, pctOff, type Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";
import { useShop } from "./Providers";

export function ProductDetail({ p, related }: { p: Product; related: Product[] }) {
  const { add, wishlist, toggleWish } = useShop();
  const [colour, setColour] = useState(p.colours[0]!.name); const [size, setSize] = useState(""); const [err, setErr] = useState(false); const [pin, setPin] = useState(""); const [eta, setEta] = useState(""); const [added, setAdded] = useState(false); const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null); const [open, setOpen] = useState("desc");
  const off = pctOff(p); const on = wishlist.includes(p.slug);
  const addBag = () => { if (!size) { setErr(true); return; } add({ slug: p.slug, size, colour }); setAdded(true); setTimeout(() => setAdded(false), 1500); };
  const check = () => setEta(/^\d{6}$/.test(pin) ? (pin.startsWith("18") ? "Local delivery in Jammu: same/next day" : "Courier delivery in 3–6 days · COD available") : "Enter a valid 6-digit pincode");
  return (
    <>
      <nav className="crumb"><Link href="/">Home</Link> / <Link href={`/collections/${p.collection}`}>{p.collection}</Link> / {p.name}</nav>
      <div className="pdp">
        <div className="gal">{p.images.map((s, i) => (
          <div key={i} className="gimg" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }} onMouseLeave={() => setZoom(null)}>
            <img src={s} alt={`${p.name} view ${i + 1}`} style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%`, transform: "scale(1.8)" } : undefined} /></div>))}</div>
        <div className="info">
          <p className="eyebrow">{p.collection} · {p.category}</p><h1>{p.name}</h1>
          <p className="price"><b>{inr(p.pricePaise)}</b>{p.compareAtPaise && <><s>{inr(p.compareAtPaise)}</s><em>{off}% off</em></>}</p><small>Inclusive of all taxes</small>
          <div className="opt"><span>Colour: <b>{colour}</b></span><div className="sw">{p.colours.map((c) => <button key={c.name} onClick={() => setColour(c.name)} className={colour === c.name ? "on" : ""} style={{ background: c.hex }} aria-label={c.name} />)}</div></div>
          <div className="opt"><span>Size <Link href="/size-guide" className="link sgl">Size guide</Link> {err && <em className="err">Please select a size</em>}</span>
            <div className="sizes">{p.sizes.map((s) => { const so = p.soldOut?.includes(s); return <button key={s} disabled={so} className={size === s ? "on" : ""} onClick={() => { setSize(s); setErr(false); }}>{s}</button>; })}</div></div>
          <div className="actions"><button className={`btn big ${added ? "ok" : ""}`} onClick={addBag}>{added ? "Added ✓" : "Add to bag"}</button>
            <button className={`btn outline sq ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-label="Wishlist" aria-pressed={on}>♥</button></div>
          <div className="pin"><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter pincode" aria-label="Pincode" /><button onClick={check}>Check</button></div>{eta && <p className="eta">{eta}</p>}
          {[["desc", "Description", p.description], ["fab", "Fabric & fit", `${p.fabric} · ${p.fit}. Machine wash cold, do not bleach.`], ["ret", "Returns", "7-day easy returns and size exchanges on unworn items with tags."]].map(([k, t, b]) => (
            <div key={k} className="acc"><button onClick={() => setOpen(open === k ? "" : k!)} aria-expanded={open === k}>{t}<span>{open === k ? "−" : "+"}</span></button><div className={open === k ? "open" : ""}><p>{b}</p></div></div>))}
        </div>
      </div>
      <section className="sec"><div className="sec-head"><h2>You may also like</h2></div><div className="grid">{related.map((r) => <ProductCard key={r.slug} p={r} />)}</div></section>
      <div className="sticky"><span>{p.name} · {inr(p.pricePaise)}</span><button className="btn" onClick={addBag}>{added ? "Added ✓" : "Add to bag"}</button></div>
    </>
  );
}
