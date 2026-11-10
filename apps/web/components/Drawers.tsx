"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { bySlug, inr, products } from "@/lib/data";
import { useShop } from "./Providers";

const FREE_SHIP = 199900;
export function BagDrawer() {
  const { bag, bagOpen, setBagOpen, setQty, subtotalPaise } = useShop();
  const left = Math.max(0, FREE_SHIP - subtotalPaise);
  return (
    <>
      <div className={`scrim ${bagOpen ? "on" : ""}`} onClick={() => setBagOpen(false)} />
      <aside className={`drawer ${bagOpen ? "on" : ""}`} aria-hidden={!bagOpen} aria-label="Shopping bag">
        <div className="d-head"><h2>Your bag</h2><button onClick={() => setBagOpen(false)} aria-label="Close">✕</button></div>
        <div className="ship"><p>{left ? <>Add <b>{inr(left)}</b> more for free shipping</> : <b>You've unlocked free shipping 🎉</b>}</p><div className="bar"><i style={{ width: `${Math.min(100, (subtotalPaise / FREE_SHIP) * 100)}%` }} /></div></div>
        <div className="d-body">
          {bag.length === 0 && <p className="empty">Your bag is empty.<br /><Link href="/collections/new-arrivals" onClick={() => setBagOpen(false)}>Shop new arrivals →</Link></p>}
          {bag.map((l, i) => { const p = bySlug(l.slug); if (!p) return null; return (
            <div className="line" key={l.slug + l.size + l.colour}>
              <img src={p.images[0]} alt={p.name} />
              <div><h4>{p.name}</h4><p>{l.colour} · {l.size}</p>
                <div className="qty"><button onClick={() => setQty(i, l.qty - 1)} aria-label="Decrease">−</button><span>{l.qty}</span><button onClick={() => setQty(i, l.qty + 1)} aria-label="Increase">+</button></div></div>
              <b>{inr(p.pricePaise * l.qty)}</b>
            </div>); })}
        </div>
        {bag.length > 0 && <div className="d-foot"><div><span>Subtotal</span><b>{inr(subtotalPaise)}</b></div><small>Taxes included. Final shipping calculated at checkout.</small>
          <Link href="/checkout" className="btn" onClick={() => setBagOpen(false)}>Checkout</Link></div>}
      </aside>
    </>
  );
}

export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useShop(); const [q, setQ] = useState(""); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) setTimeout(() => ref.current?.focus(), 50); const k = (e: KeyboardEvent) => e.key === "Escape" && setSearchOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [searchOpen, setSearchOpen]);
  const res = useMemo(() => { const s = q.trim().toLowerCase(); return s ? products.filter((p) => `${p.name} ${p.category} ${p.collection} ${p.colours.map((c) => c.name).join(" ")}`.toLowerCase().includes(s)) : []; }, [q]);
  return (
    <div className={`search ${searchOpen ? "on" : ""}`} aria-hidden={!searchOpen}>
      <button className="x" onClick={() => setSearchOpen(false)} aria-label="Close search">✕</button>
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search blazers, tees, kids…" aria-label="Search products" />
      {!q && <div className="pop"><span>Popular</span>{["Blazer", "White tee", "Jeans", "Kids set", "Sweatshirt"].map((t) => <button key={t} onClick={() => setQ(t)}>{t}</button>)}</div>}
      {q && res.length === 0 && <p className="none">No results for “{q}”. Try “shirt” or “jacket”.</p>}
      <div className="sres">{res.slice(0, 8).map((p) => (
        <Link key={p.slug} href={`/products/${p.slug}`} onClick={() => setSearchOpen(false)}><img src={p.images[0]} alt="" /><span>{p.name}</span><b>{inr(p.pricePaise)}</b></Link>))}</div>
    </div>
  );
}
