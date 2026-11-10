"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function CollectionView({ title, blurb, items, failed }: { title: string; blurb: string; items: Product[]; failed: boolean }) {
  const cats = useMemo(() => [...new Set(items.map((p) => p.category))], [items]);
  const sizes = useMemo(() => [...new Set(items.flatMap((p) => p.sizes))], [items]);
  const [cat, setCat] = useState(""); const [sort, setSort] = useState("featured"); const [size, setSize] = useState(""); const [open, setOpen] = useState(false); const [stock, setStock] = useState(false);
  useEffect(() => { const c = new URLSearchParams(location.search).get("cat"); if (c) setCat(c); }, []);
  const list = useMemo(() => {
    let l = items.filter((p) => (!cat || p.category === cat) && (!size || p.variants.some((v) => v.size === size && v.available > 0)) && (!stock || p.inStock));
    if (sort === "low") l = [...l].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === "high") l = [...l].sort((a, b) => b.pricePaise - a.pricePaise);
    if (sort === "new") l = [...l].sort((a, b) => Number(b.isNew) - Number(a.isNew));
    return l;
  }, [items, cat, sort, size, stock]);
  const active = (size ? 1 : 0) + (stock ? 1 : 0);
  return (
    <>
      <section className="banner"><p className="eyebrow">Collection</p><h1>{title}</h1><p className="lede">{blurb}</p></section>
      <div className="bar-row"><div className="wrap bar-in">
        <div className="chips" role="group" aria-label="Category">
          {cats.length > 1 && <><button className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>{cats.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</>}
        </div>
        <div className="ctrl"><span aria-live="polite">{list.length} {list.length === 1 ? "piece" : "pieces"}</span>
          <button className="fbtn" onClick={() => setOpen(!open)} aria-expanded={open}>Filter{active > 0 && ` (${active})`}</button>
          <label className="sel"><span className="sr">Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Featured</option><option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>
      </div></div>
      <div className={`filters ${open ? "open" : ""}`}><div className="wrap fil-in">
        <div><span>Size</span>{sizes.map((s) => <button key={s} className={size === s ? "on" : ""} onClick={() => setSize(size === s ? "" : s)}>{s}</button>)}</div>
        <label className="chk"><input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} /> In stock only</label>
        {active > 0 && <button className="link" onClick={() => { setSize(""); setStock(false); }}>Clear filters</button>}
      </div></div>
      <div className="wrap grid pad">{list.map((p, i) => <Reveal key={p.slug} delay={(i % 4) * 60}><ProductCard p={p} priority={i < 4} /></Reveal>)}</div>
      {failed && <p className="empty wrap">We couldn't load this collection. Please refresh in a moment.</p>}
      {!failed && list.length === 0 && <p className="empty wrap">Nothing matches those filters. <button className="link" onClick={() => { setCat(""); setSize(""); setStock(false); }}>Clear all</button></p>}
    </>
  );
}
