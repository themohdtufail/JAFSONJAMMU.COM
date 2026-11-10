"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { useShop } from "@/components/Providers";

export default function Wishlist() {
  const { wishlist } = useShop(); const [all, setAll] = useState<Product[] | null>(null); const [fail, setFail] = useState(false);
  useEffect(() => { api<Product[]>("/products?limit=100").then(setAll).catch(() => setFail(true)); }, []);
  const items = (all ?? []).filter((p) => wishlist.includes(p.slug));
  return (<><section className="banner"><p className="eyebrow">Saved for later</p><h1>Wishlist</h1><p className="lede">{all ? `${items.length} ${items.length === 1 ? "piece" : "pieces"}` : "Loading…"}</p></section>
    <div className="wrap">
      {fail && <p className="empty">We couldn't load your wishlist. Please refresh.</p>}
      {all && items.length > 0 && <div className="grid pad">{items.map((p) => <ProductCard key={p.slug} p={p} />)}</div>}
      {all && items.length === 0 && <p className="empty">Nothing saved yet. <Link href="/collections/new-arrivals" className="link">Browse new arrivals</Link></p>}
    </div></>);
}
