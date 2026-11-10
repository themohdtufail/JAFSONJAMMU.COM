"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr, isKids, pctOff, sizeLabel, variantOf, type Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";
import { useShop } from "./Providers";

export function ProductDetail({ p }: { p: Product }) {
  const { add, wishlist, toggleWish } = useShop(); const kids = isKids(p);
  const [colour, setColour] = useState(p.colours.find((c) => p.variants.some((v) => v.colour === c.name && v.available > 0))?.name ?? p.colours[0]!.name);
  const [size, setSize] = useState(""); const [err, setErr] = useState(false); const [pin, setPin] = useState(""); const [eta, setEta] = useState<{ ok: boolean; text: string } | null>(null); const [added, setAdded] = useState(false);
  const [open, setOpen] = useState("desc"); const [img, setImg] = useState(0); const sizesRef = useRef<HTMLDivElement>(null);
  const v = size ? variantOf(p, colour, size) : undefined; const off = pctOff(p); const on = wishlist.includes(p.slug);
  const sizeVariants = useMemo(() => p.sizes.map((s) => ({ s, v: variantOf(p, colour, s) })), [p, colour]);
  const anyAvail = sizeVariants.some((x) => x.v && x.v.available > 0);
  const outSizes = sizeVariants.filter((x) => !x.v || x.v.available <= 0).map((x) => sizeLabel(x.s));

  const addBag = () => {
    if (!v) { setErr(true); sizesRef.current?.querySelector("button")?.focus(); return; }
    add(p, v); setAdded(true); setTimeout(() => setAdded(false), 1600);
  };
  const check = async () => {
    try { const r = await api<{ local: boolean; estimate: string; codAllowed: boolean }>(`/checkout/serviceability?pincode=${pin}`); setEta({ ok: true, text: `Delivery to ${pin}: ${r.local ? "from our Jammu store, " : ""}arrives in ${r.estimate.toLowerCase()}.${r.codAllowed ? " Cash on delivery available." : ""}` }); }
    catch (e) { setEta({ ok: false, text: friendly(e) }); }
  };
  const label = !anyAvail ? "Out of stock" : !size ? "Select a size" : added ? "Added to bag" : "Add to bag";
  return (
    <div className={kids ? "kids-theme pdp-wrap" : "pdp-wrap"}>
      <nav className="crumb wrap" aria-label="Breadcrumb"><Link href="/">Home</Link><i>/</i><Link href={`/collections/${p.collection}`}>{kids ? "Kids" : "Men"}</Link><i>/</i><span>{p.name}</span></nav>
      <div className="wrap pdp">
        <div className="gal">
          <div className="thumbs">{p.images.map((s, i) => <button key={i} className={i === img ? "on" : ""} onClick={() => setImg(i)} aria-label={`Show photo ${i + 1}`}><img src={s} alt="" width={72} height={90} /></button>)}</div>
          <div className="gmain"><img key={img} src={p.images[img]} alt={`${p.name}, photo ${img + 1}`} width={800} height={1000} /></div>
        </div>
        <div className="info">
          <div><p className="eyebrow">{p.brand}</p><h1>{p.name}</h1></div>
          <div><p className="price lg"><b>{inr(p.pricePaise)}</b>{p.compareAtPaise && <><s>{inr(p.compareAtPaise)}</s><span className="off">{off}% off</span></>}</p><p className="tax">Inclusive of all taxes. Delivery charges shown at checkout.</p></div>

          <div className="opt"><div className="opt-h"><span className="eyebrow plain">Colour</span><b>{colour}</b></div>
            <div className="sw">{p.colours.map((c) => <button key={c.name} onClick={() => { setColour(c.name); setSize(""); }} className={colour === c.name ? "on" : ""} style={{ background: c.hex }} aria-label={c.name} aria-pressed={colour === c.name} title={c.name} />)}</div></div>

          <div className="opt"><div className="opt-h"><span className="eyebrow plain">{kids ? "Age" : "Size"}</span><Link href="/size-guide" className="ulink sm">Size guide</Link></div>
            <div className="sizes" role="group" aria-label={kids ? "Age" : "Size"} ref={sizesRef}>{sizeVariants.map(({ s, v: sv }) => { const out = !sv || sv.available <= 0; return <button key={s} className={`${size === s ? "on" : ""} ${out ? "off" : ""}`} aria-disabled={out} onClick={() => { if (out) return; setSize(s); setErr(false); }} aria-pressed={size === s} title={out ? "Out of stock" : undefined}>{sizeLabel(s)}</button>; })}</div>
            {err && <p className="field-err" role="alert">Select a {kids ? "age" : "size"} to add this to your bag.</p>}
            {outSizes.length > 0 && anyAvail && <p className="hint">Out of stock: {outSizes.join(", ")}.</p>}
            {!anyAvail && <p className="stock out">Out of stock in {colour}.</p>}
            {v && v.stockStatus === "LOW_STOCK" && <p className="stock low">Only {v.available} left in this {kids ? "age" : "size"}.</p>}
            {v && v.stockStatus === "IN_STOCK" && <p className="stock ok">✓ In stock</p>}
          </div>

          <div className="actions">
            <button className={`btn primary big ${!size || !anyAvail ? "disabled" : ""}`} aria-disabled={!size || !anyAvail} onClick={() => anyAvail && addBag()}>{label}</button>
            <button className={`btn outline big ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-pressed={on}>{on ? "Saved to wishlist" : "Add to wishlist"}</button>
          </div>

          <div className="pin-block"><label htmlFor="pin" className="eyebrow plain">Check delivery</label>
            <div className="pin"><input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && pin.length === 6 && check()} inputMode="numeric" placeholder="180001" /><button onClick={check} disabled={pin.length !== 6}>Check</button></div>
            {eta && <p className={`eta ${eta.ok ? "" : "bad"}`} role="status">{eta.text}</p>}</div>

          {[["desc", "Description", p.description], ["fab", "Fabric and care", `${p.fabric}. ${p.fit}. Machine wash cold with similar colours. Do not bleach. Warm iron.`], ["ret", "Returns and exchange", "Return or exchange within 7 days of delivery. Items must be unworn, unwashed and have tags attached."]].map(([k, t, b]) => (
            <div key={k} className="acc"><button onClick={() => setOpen(open === k ? "" : k!)} aria-expanded={open === k}>{t}<span aria-hidden>{open === k ? "−" : "+"}</span></button><div className={open === k ? "open" : ""}><p>{b}</p></div></div>))}
        </div>
      </div>
      {p.related && p.related.length > 0 && <section className="section wrap"><div className="sec-head"><div><p className="eyebrow">Related</p><h2>You may also like</h2></div></div><div className="grid">{p.related.map((r) => <ProductCard key={r.slug} p={r} />)}</div></section>}
      <div className="sticky"><span><b>{p.name}</b>{inr(p.pricePaise)}</span><button className={`btn primary ${!size || !anyAvail ? "disabled" : ""}`} aria-disabled={!size || !anyAvail} onClick={() => anyAvail && addBag()}>{label}</button></div>
    </div>
  );
}
