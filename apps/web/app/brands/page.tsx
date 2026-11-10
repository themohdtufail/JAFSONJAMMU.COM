import Link from "next/link";
import type { Metadata } from "next";
import { api } from "@/lib/api";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brands", description: "Shop menswear and kidswear by brand." };
export default async function Brands() {
  const brands = await api<{ name: string; products: number }[]>("/brands").catch(() => []);
  return (<>
    <section className="banner"><div className="wrap"><p className="eyebrow">Shop by brand</p><h1>Brands</h1></div></section>
    <div className="wrap brands">
      {brands.map((b) => <Link key={b.name} href={`/collections/all?brand=${encodeURIComponent(b.name)}`} className="brand-tile"><b>{b.name}</b><span>{b.products} {b.products === 1 ? "product" : "products"}</span></Link>)}
      {brands.length === 0 && <p className="empty">No brands to show yet.</p>}
    </div></>);
}
