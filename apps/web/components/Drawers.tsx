"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { inr, sizeLabel, type Product } from "@/lib/data";
import { useShop } from "./Providers";

const FREE_SHIP = 199900;

export function BagDrawer() {
  const { bag, bagOpen, setBagOpen, setQty, subtotalPaise } = useShop();
  const left = Math.max(0, FREE_SHIP - subtotalPaise);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setBagOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [setBagOpen]);
  useEffect(() => { document.body.style.overflow = bagOpen ? "hidden" : ""; }, [bagOpen]);
  return (
    <>
      <div className={`scrim ${bagOpen ? "on" : ""}`} onClick={() => setBagOpen(false)} />
      <aside className={`drawer ${bagOpen ? "on" : ""}`} aria-hidden={!bagOpen} aria-label="Shopping bag" role="dialog">
        <div className="d-head"><h2>Your bag</h2><button onClick={() => setBagOpen(false)} aria-label="Close bag">✕</button></div>
        {bag.length > 0 && <div className="ship"><p>{left ? <>Add <b>{inr(left)}</b> more for free delivery</> : <b>You get free delivery</b>}</p><div className="bar"><i style={{ width: `${Math.min(100, (subtotalPaise / FREE_SHIP) * 100)}%` }} /></div></div>}
        <div className="d-body">
          {bag.length === 0 && <div className="empty-bag"><p>Your bag is empty. Start with new arrivals.</p><Link href="/collections/new-arrivals" onClick={() => setBagOpen(false)} className="btn primary">Shop new arrivals</Link></div>}
          {bag.map((l) => (
            <div className="line" key={l.sku}>
              <Link href={`/products/${l.slug}`} onClick={() => setBagOpen(false)}><img src={l.image} alt={l.name} width={84} height={112} /></Link>
              <div><h4>{l.name}</h4><p>{l.colour} · {sizeLabel(l.size)}</p>
                <div className="qty"><button onClick={() => setQty(l.sku, l.quantity - 1)} aria-label={`Decrease ${l.name}`}>−</button><span aria-live="polite">{l.quantity}</span><button onClick={() => setQty(l.sku, l.quantity + 1)} aria-label={`Increase ${l.name}`}>+</button></div>
                <button className="rm" onClick={() => setQty(l.sku, 0)}>Remove</button></div>
              <b>{inr(l.pricePaise * l.quantity)}</b>
            </div>
          ))}
        </div>
        {bag.length > 0 && <div className="d-foot"><div className="sub"><span>Subtotal</span><b>{inr(subtotalPaise)}</b></div><small>Inclusive of all taxes. Delivery charges are shown at checkout.</small>
          <Link href="/checkout" className="btn primary block" onClick={() => setBagOpen(false)}>Checkout</Link></div>}
      </aside>
    </>
  );
}

export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useShop();
  const [q, setQ] = useState(""); const [res, setRes] = useState<Product[]>([]); const [busy, setBusy] = useState(false); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) setTimeout(() => ref.current?.focus(), 80); document.body.style.overflow = searchOpen ? "hidden" : ""; }, [searchOpen]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setSearchOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [setSearchOpen]);
  useEffect(() => {
    const s = q.trim(); if (s.length < 2) { setRes([]); return; }
    const ctl = new AbortController(); setBusy(true);
    const t = setTimeout(() => api<Product[]>(`/search?q=${encodeURIComponent(s)}`, { signal: ctl.signal }).then(setRes).catch(() => {}).finally(() => setBusy(false)), 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  const searched = q.trim().length >= 2;
  return (
    <div className={`search ${searchOpen ? "on" : ""}`} aria-hidden={!searchOpen} role="dialog" aria-label="Search">
      <div className="search-in">
        <button className="x" onClick={() => setSearchOpen(false)} aria-label="Close search">✕</button>
        <label className="eyebrow" htmlFor="q">Search the store</label>
        <input id="q" ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shirts, jeans, brands" autoComplete="off" />
        {!searched && <div className="pop"><span>Popular</span>{["Blazer", "White tee", "Jeans", "Kids set", "Sweatshirt"].map((t) => <button key={t} onClick={() => setQ(t)}>{t}</button>)}</div>}
        {searched && !busy && res.length === 0 && <p className="none">No results for “{q}”. Try “shirt”, “jacket” or “kids”.</p>}
        <div className="sres">{res.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} onClick={() => { setSearchOpen(false); setQ(""); }}><img src={p.images[0]} alt="" width={64} height={84} /><span>{p.name}<small>{p.brand} · {p.category}</small></span><b>{inr(p.pricePaise)}</b></Link>))}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useShop();
  return <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}
