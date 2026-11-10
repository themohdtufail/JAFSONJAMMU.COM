"use client";
import { useEffect, useMemo, useState } from "react";
import { pctOff, sizeLabel, type Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";

const PRICE: [string, number, number][] = [["Under ₹1,000", 0, 100000], ["₹1,000 to ₹2,499", 100000, 250000], ["₹2,500 to ₹4,999", 250000, 500000], ["₹5,000 and above", 500000, Infinity]];

export function CollectionView({ title, blurb, items, failed, kids }: { title: string; blurb: string; items: Product[]; failed: boolean; kids: boolean }) {
  const cats = useMemo(() => [...new Set(items.map((p) => p.category))], [items]);
  const sizes = useMemo(() => [...new Set(items.flatMap((p) => p.sizes))], [items]);
  const brands = useMemo(() => [...new Set(items.map((p) => p.brand))], [items]);
  const colours = useMemo(() => [...new Set(items.flatMap((p) => p.colours.map((c) => c.name)))].sort(), [items]);
  const [cat, setCat] = useState(""); const [sort, setSort] = useState("featured"); const [size, setSize] = useState(""); const [brand, setBrand] = useState(""); const [price, setPrice] = useState(-1); const [colour, setColour] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => { const q = new URLSearchParams(location.search); const c = q.get("cat"); if (c) setCat(c); const b = q.get("brand"); if (b) setBrand(b); }, []);
  const list = useMemo(() => {
    let l = items.filter((p) => (!cat || p.category === cat) && (!brand || p.brand === brand) && (!colour || p.colours.some((c) => c.name === colour))
      && (!size || p.variants.some((v) => v.size === size && v.available > 0)) && (price < 0 || (p.pricePaise >= PRICE[price]![1] && p.pricePaise < PRICE[price]![2])));
    if (sort === "low") l = [...l].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === "high") l = [...l].sort((a, b) => b.pricePaise - a.pricePaise);
    if (sort === "new") l = [...l].sort((a, b) => Number(b.isNew) - Number(a.isNew));
    if (sort === "discount") l = [...l].sort((a, b) => pctOff(b) - pctOff(a));
    return l;
  }, [items, cat, sort, size, brand, price, colour]);
  const active: [string, () => void][] = [];
  if (size) active.push([`Size ${sizeLabel(size)}`, () => setSize("")]); if (brand) active.push([brand, () => setBrand("")]); if (price >= 0) active.push([PRICE[price]![0], () => setPrice(-1)]); if (colour) active.push([colour, () => setColour("")]);
  const clear = () => { setSize(""); setBrand(""); setPrice(-1); setColour(""); setCat(""); };
  return (
    <div className={kids ? "kids-theme" : ""}>
      <section className={`banner ${kids ? "kids-banner" : ""}`}>
        <div className="wrap banner-in">
          {kids && <img className="kids-logo" src="/brand/kids-badge.png" alt="Jafson Kids" width={120} height={120} />}
          <div><p className="eyebrow">{kids ? "Jafson Kids" : "Collection"}</p><h1>{title}</h1><p className="lede">{blurb}</p></div>
        </div>
      </section>
      <div className="bar-row"><div className="wrap bar-in">
        <div className="chips" role="group" aria-label="Category">
          {cats.length > 1 && <><button className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>{cats.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</>}
        </div>
        <div className="ctrl"><span aria-live="polite">{list.length} {list.length === 1 ? "product" : "products"}</span>
          <button className="fbtn" onClick={() => setOpen(!open)} aria-expanded={open}>Filters{active.length > 0 && ` (${active.length})`}</button>
          <label className="sel"><span className="sr">Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Featured</option><option value="new">Newest</option><option value="low">Price low to high</option><option value="high">Price high to low</option><option value="discount">Discount</option></select></label></div>
      </div></div>
      <div className={`filters ${open ? "open" : ""}`}><div className="wrap fil-in">
        <div className="fgroup"><span>Size</span>{sizes.map((s) => <button key={s} className={size === s ? "on" : ""} onClick={() => setSize(size === s ? "" : s)} aria-pressed={size === s}>{sizeLabel(s)}</button>)}</div>
        {brands.length > 1 && <div className="fgroup"><span>Brand</span>{brands.map((b) => <button key={b} className={brand === b ? "on" : ""} onClick={() => setBrand(brand === b ? "" : b)} aria-pressed={brand === b}>{b}</button>)}</div>}
        <div className="fgroup"><span>Price</span>{PRICE.map(([l], i) => <button key={l} className={price === i ? "on" : ""} onClick={() => setPrice(price === i ? -1 : i)} aria-pressed={price === i}>{l}</button>)}</div>
        <div className="fgroup"><span>Colour</span>{colours.map((c) => <button key={c} className={colour === c ? "on" : ""} onClick={() => setColour(colour === c ? "" : c)} aria-pressed={colour === c}>{c}</button>)}</div>
      </div></div>
      {active.length > 0 && <div className="wrap active"><div className="chips">{active.map(([l, rm]) => <button key={l} className="tint" onClick={rm} aria-label={`Remove filter ${l}`}>{l} <span aria-hidden>✕</span></button>)}<button className="link" onClick={clear}>Clear all</button></div></div>}
      <h2 className="sr">Products</h2>
      <div className="wrap grid pad">{list.map((p, i) => <ProductCard key={p.slug} p={p} priority={i < 4} />)}</div>
      {failed && <p className="empty wrap">We can't load this collection right now. Refresh in a moment.</p>}
      {!failed && list.length === 0 && <p className="empty wrap">No products match these filters. <button className="link" onClick={clear}>Clear filters</button></p>}
    </div>
  );
}
