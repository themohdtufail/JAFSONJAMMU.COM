"use client";
import Link from "next/link";
import { inr, pctOff, type Product } from "@/lib/data";
import { useShop } from "./Providers";

export function ProductCard({ p, priority = false }: { p: Product; priority?: boolean }) {
  const { wishlist, toggleWish, add } = useShop();
  const on = wishlist.includes(p.slug); const off = pctOff(p);
  const first = p.colours[0]!.name;
  return (
    <article className="card">
      <div className="card-media">
        <Link href={`/products/${p.slug}`} className="card-img" aria-label={p.name}>
          <img src={p.images[0]} alt={p.name} loading={priority ? "eager" : "lazy"} className="i1" width={600} height={800} />
          <img src={p.images[1] ?? p.images[0]} alt="" loading="lazy" className="i2" width={600} height={800} />
        </Link>
        <div className="badges">
          {!p.inStock ? <span className="badge dark">Sold out</span> : <>{p.isNew && <span className="badge">New</span>}{off > 0 && <span className="badge accent">−{off}%</span>}</>}
        </div>
        <button className={`heart ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-label={on ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={on}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 8 3.4 5 6.6 5c1.9 0 3.5 1 5.4 3 1.9-2 3.5-3 5.4-3 3.2 0 5 3 3.8 6.2-1.7 4.7-9.2 9.3-9.2 9.3z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
        </button>
        {p.inStock && (
          <div className="quickadd" aria-label="Quick add">
            <span>Quick add</span>
            <div>{p.sizes.map((s) => { const v = p.variants.find((x) => x.colour === first && x.size === s); const ok = !!v && v.available > 0;
              return <button key={s} disabled={!ok} onClick={() => v && add(p, v)} aria-label={`Add size ${s}`}>{s}</button>; })}</div>
          </div>
        )}
      </div>
      <Link href={`/products/${p.slug}`} className="card-info">
        <h3>{p.name}</h3>
        <p className="price"><span>{inr(p.pricePaise)}</span>{p.compareAtPaise && <s>{inr(p.compareAtPaise)}</s>}</p>
        <div className="meta">
          <div className="dots">{p.colours.map((c) => <i key={c.name} title={c.name} style={{ background: c.hex }} />)}</div>
          {p.fewLeft && <em>Few left</em>}
        </div>
      </Link>
    </article>
  );
}
