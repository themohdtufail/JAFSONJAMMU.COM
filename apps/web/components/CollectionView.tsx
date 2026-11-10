"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";

export function CollectionView({ title, blurb, items, cats }: { title: string; blurb: string; items: Product[]; cats: string[] }) {
  const [cat, setCat] = useState(""); const [sort, setSort] = useState("featured"); const [size, setSize] = useState(""); const [open, setOpen] = useState(false);
  useEffect(() => { const c = new URLSearchParams(location.search).get("cat"); if (c && cats.includes(c)) setCat(c); }, [cats]);
  const sizes = useMemo(() => [...new Set(items.flatMap((p) => p.sizes))], [items]);
  const list = useMemo(() => {
    let l = items.filter((p) => (!cat || p.category === cat) && (!size || (p.sizes.includes(size) && !p.soldOut?.includes(size))));
    if (sort === "low") l = [...l].sort((a, b) => a.pricePaise - b.pricePaise);
    if (sort === "high") l = [...l].sort((a, b) => b.pricePaise - a.pricePaise);
    if (sort === "new") l = [...l].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
    return l;
  }, [items, cat, sort, size]);
  return (
    <>
      <section className="banner"><h1>{title}</h1><p>{blurb}</p></section>
      <div className="bar-row">
        <div className="chips">
          {cats.length > 0 && <><button className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>{cats.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</>}
        </div>
        <div className="ctrl"><span>{list.length} products</span>
          <button className="fbtn" onClick={() => setOpen(!open)} aria-expanded={open}>Filter{size && " (1)"}</button>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="featured">Featured</option><option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
      </div>
      <div className={`filters ${open ? "open" : ""}`}><div><span>Size</span>{sizes.map((s) => <button key={s} className={size === s ? "on" : ""} onClick={() => setSize(size === s ? "" : s)}>{s}</button>)}{size && <button className="clear" onClick={() => setSize("")}>Clear ✕</button>}</div></div>
      <div className="grid pad">{list.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
      {list.length === 0 && <p className="empty pad">Nothing matches those filters. <button className="link" onClick={() => { setCat(""); setSize(""); }}>Clear all</button></p>}
    </>
  );
}
