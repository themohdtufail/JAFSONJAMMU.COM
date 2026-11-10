"use client";
import Link from "next/link";
import { bySlug } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { useShop } from "@/components/Providers";
export default function Wishlist() {
  const { wishlist } = useShop(); const items = wishlist.map(bySlug).filter(Boolean);
  return (<><section className="banner"><h1>Wishlist</h1><p>{items.length} saved</p></section>
    {items.length ? <div className="grid pad">{items.map((p) => <ProductCard key={p!.slug} p={p!} />)}</div> : <p className="empty pad">Nothing saved yet. <Link href="/collections/new-arrivals">Browse new arrivals →</Link></p>}</>);
}
