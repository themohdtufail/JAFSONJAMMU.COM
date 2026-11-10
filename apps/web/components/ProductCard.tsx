"use client";
import Link from "next/link";
import { inr, pctOff, type Product } from "@/lib/data";
import { useShop } from "./Providers";
export function ProductCard({ p }: { p: Product }) {
  const { wishlist, toggleWish } = useShop(); const on = wishlist.includes(p.slug); const off = pctOff(p);
  return (
    <article className="card">
      <Link href={`/products/${p.slug}`} className="card-img" aria-label={p.name}>
        <img src={p.images[0]} alt={p.name} loading="lazy" className="i1" />
        <img src={p.images[1] ?? p.images[0]} alt="" loading="lazy" className="i2" />
        {p.isNew && <span className="tag">NEW</span>}
        {off > 0 && <span className="tag off">{off}% OFF</span>}
        <span className="quick">View product →</span>
      </Link>
      <button className={`heart ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-label={on ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={on}>♥</button>
      <Link href={`/products/${p.slug}`} className="card-info">
        <h3>{p.name}</h3>
        <p><b>{inr(p.pricePaise)}</b>{p.compareAtPaise && <s>{inr(p.compareAtPaise)}</s>}</p>
        <div className="dots">{p.colours.map((c) => <i key={c.name} title={c.name} style={{ background: c.hex }} />)}</div>
      </Link>
    </article>
  );
}
