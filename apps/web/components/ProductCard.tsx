"use client";
import Link from "next/link";
import { inr, isKids, pctOff, sizeLabel, type Product } from "@/lib/data";
import { useShop } from "./Providers";

/** Brand kit badges: at most two, only when the claim is true today. Sale, then low stock, then bestseller, then new. */
function badgesFor(p: Product, off: number, kids: boolean) {
  if (!p.inStock) return [{ text: "Out of stock", cls: "dark" }];
  const all = [off > 0 && { text: `Sale ${off}% off`, cls: "sale" }, p.unitsLeft !== null && { text: `Only ${p.unitsLeft} left`, cls: "low" }, p.isBest && { text: "Bestseller", cls: "gold" }, p.isNew && { text: kids ? "New for kids" : "New", cls: kids ? "kids" : "new" }];
  return all.filter((b): b is { text: string; cls: string } => !!b).slice(0, 2);
}

export function ProductCard({ p, priority = false }: { p: Product; priority?: boolean }) {
  const { wishlist, toggleWish } = useShop();
  const on = wishlist.includes(p.slug); const off = pctOff(p); const kids = isKids(p);
  const avail = new Set(p.variants.filter((v) => v.available > 0).map((v) => v.size));
  return (
    <article className={`card ${kids ? "kids" : ""}`}>
      <Link href={`/products/${p.slug}`} className="card-link" aria-label={`${p.brand} ${p.name}`}>
        <span className="card-img">
          <img src={p.images[0]} alt={`${p.name}, front`} loading={priority ? "eager" : "lazy"} className="i1" width={640} height={800} />
          <img src={p.images[1] ?? p.images[0]} alt="" loading="lazy" className="i2" width={640} height={800} />
        </span>
        <span className="card-body">
          <span className="brandname">{p.brand}</span>
          <h3>{p.name}</h3>
          <span className="price"><b>{inr(p.pricePaise)}</b>{p.compareAtPaise && <><s>{inr(p.compareAtPaise)}</s><span className="off">{off}% off</span></>}</span>
          <span className="sizes-row" aria-label="Sizes">{p.sizes.map((s) => <span key={s} className={`chip-sm ${avail.has(s) ? "" : "x"}`}>{sizeLabel(s)}</span>)}</span>
        </span>
      </Link>
      <div className="badges">{badgesFor(p, off, kids).map((b) => <span key={b.text} className={`badge ${b.cls}`}>{b.text}</span>)}</div>
      <button className={`heart ${on ? "on" : ""}`} onClick={() => toggleWish(p.slug)} aria-label={on ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} aria-pressed={on}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M12 20s-7-4.4-8.6-8.8C2.4 8.4 4 5.500 6.800 5.500c1.800 0 3.200.9 5.200 3 2-2.100 3.400-3 5.200-3 2.800 0 4.400 2.900 3.400 5.700C19 15.600 12 20 12 20z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      </button>
    </article>
  );
}
