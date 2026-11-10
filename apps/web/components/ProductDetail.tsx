"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr, pctOff, variantOf, type Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";
import { useShop } from "./Providers";

export function ProductDetail({ p }: { p: Product }) {
  const { add, wishlist, toggleWish } = useShop();
  const [colour, setColour] = useState(p.colours.find((c) => p.variants.some((v) => v.colour === c.name && v.available > 0))?.name ?? p.colours[0]!.name);
  const [size, setSize] = useState(""); const [err, setErr] = useState(false); const [pin, setPin] = useState(""); const [eta, setEta] = useState<{ ok: boolean; text: string } | null>(null); const [added, setAdded] = useState(false);
  const [open, setOpen] = useState("desc"); const [img, setImg] = useState(0); const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const v = size ? variantOf(p, colour, size) : undefined;
  const off = pctOff(p); const on = wishlist.includes(p.slug);
  const sizeVariants = useMemo(() => p.sizes.map((s) => ({ s, v: variantOf(p, colour, s) })), [p, colour]);
  const anyAvail = sizeVariants.some((x) => x.v && x.v.available > 0);

  const addBag = () => {
    if (!v) { setErr(true); return; }
    if (v.available <= 0) return;
    add(p, v); setAdded(true); setTimeout(() => setAdded(false), 1600);
  };
  const check = async () => {
    try { const r = await api<{ local: boolean; estimate: string; codAllowed: boolean }>(`/checkout/serviceability?pincode=${pin}`); setEta({ ok: true, text: `${r.local ? "Local delivery from our Jammu showroom" : "Courier delivery"}: ${r.estimate}${r.codAllowed ? " · Cash on delivery available" : ""}` }); }
    catch (e) { setEta({ ok: false, text: friendly(e) }); }
  };
  return (
    <>
      <nav className="crumb wrap" aria-label="Breadcrumb"><Link href="/">Home</Link><i>/</i><Link href={`/collections/${p.collection}`}>{p.collection === "men" ? "Men" : "Kids"}</Link><i>/</i><span>{p.name}</span></nav>
      <div className="wrap pdp">
        <div className="gal">
          <div className="thumbs">{p.images.map((s, i) => <button key={i} className={i === img ? "on" : ""} onClick={() => setImg(i)} aria-label={`View image ${i + 1}`}><img src={s} alt="" width={72} height={96} /></button>)}</div>
          <div className="gmain" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }} onMouseLeave={() => setZoom(null)}>
            <img key={img} src={p.images[img]} alt={`${p.name}, view ${img + 1}`} style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%`, transform: "scale(1.9)" } : undefined} width={900} height={1200} />
          </div>
        </div>
        <div className="info">
          <p className="eyebrow">{p.collection === "men" ? "Men" : "Kids"} · {p.category}</p>
          <h1>{p.name}</h1>
          <p className="price lg"><b>{inr(p.pricePaise)}</b>{p.compareAtPaise && <><s>{inr(p.compareAtPaise)}</s><em>{off}% off</em></>}</p>
          <p className="tax">Inclusive of all taxes</p>

          <div className="opt"><div className="opt-h"><span>Colour <b>{colour}</b></span></div>
            <div className="sw">{p.colours.map((c) => <button key={c.name} onClick={() => { setColour(c.name); setSize(""); }} className={colour === c.name ? "on" : ""} style={{ background: c.hex }} aria-label={c.name} aria-pressed={colour === c.name} title={c.name} />)}</div></div>

          <div className="opt"><div className="opt-h"><span>Size {err && <em className="err" role="alert">Please select a size</em>}</span><Link href="/size-guide" className="ulink sm">Size guide</Link></div>
            <div className="sizes" role="group" aria-label="Size">{sizeVariants.map(({ s, v: sv }) => { const out = !sv || sv.available <= 0; return <button key={s} disabled={out} className={size === s ? "on" : ""} onClick={() => { setSize(s); setErr(false); }} aria-pressed={size === s}>{s}</button>; })}</div>
            {!anyAvail && <p className="stock out">This colour is currently sold out.</p>}
            {v && v.stockStatus === "LOW_STOCK" && <p className="stock low">Only {v.available} left in this size</p>}
            {v && v.stockStatus === "IN_STOCK" && <p className="stock ok">In stock</p>}
          </div>

          <div className="actions">
            <button className={`btn big ${added ? "ok" : ""}`} onClick={addBag} disabled={!anyAvail}>{!anyAvail ? "Sold out" : added ? "Added to bag ✓" : "Add to bag"}</button>
            <button className={`btn outline sq ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-label={on ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={on}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M12 20.5s-7.500-4.600-9.200-9.300C1.600 8 3.400 5 6.600 5c1.900 0 3.500 1 5.400 3 1.900-2 3.500-3 5.400-3 3.200 0 5 3 3.800 6.200-1.700 4.700-9.200 9.300-9.200 9.300z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></button>
          </div>

          <div className="pin"><label className="sr" htmlFor="pin">Pincode</label><input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && pin.length === 6 && check()} inputMode="numeric" placeholder="Check delivery at your pincode" /><button onClick={check} disabled={pin.length !== 6}>Check</button></div>
          {eta && <p className={`eta ${eta.ok ? "" : "bad"}`} role="status">{eta.text}</p>}

          <ul className="assure"><li>Complimentary shipping above ₹1,999</li><li>7-day easy returns and size exchange</li><li>Collect free from our Jammu showroom</li></ul>

          {[["desc", "Description", p.description], ["fab", "Fabric & care", `${p.fabric}. ${p.fit}. Machine wash cold with similar colours, do not bleach, warm iron.`], ["ret", "Returns & exchange", "Return or exchange within 7 days of delivery. Items must be unworn, unwashed and have tags attached."]].map(([k, t, b]) => (
            <div key={k} className="acc"><button onClick={() => setOpen(open === k ? "" : k!)} aria-expanded={open === k}>{t}<span aria-hidden>{open === k ? "−" : "+"}</span></button><div className={open === k ? "open" : ""}><p>{b}</p></div></div>))}
        </div>
      </div>
      {p.related && p.related.length > 0 && <section className="section wrap"><div className="sec-head"><div><p className="eyebrow">Complete the look</p><h2>You may also like</h2></div></div><div className="grid">{p.related.map((r) => <ProductCard key={r.slug} p={r} />)}</div></section>}
      <div className="sticky"><span><b>{p.name}</b>{inr(p.pricePaise)}</span><button className="btn" onClick={addBag} disabled={!anyAvail}>{added ? "Added ✓" : "Add to bag"}</button></div>
    </>
  );
}
