import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";
import { CollectionView } from "@/components/CollectionView";

export const dynamic = "force-dynamic";
const defs: Record<string, { title: string; blurb: string; qs: string }> = {
  men: { title: "Men", blurb: "Tailoring, tees and layers for every day.", qs: "collection=men" },
  kids: { title: "Kids", blurb: "Comfortable, playful and made to last.", qs: "collection=kids" },
  "new-arrivals": { title: "New Arrivals", blurb: "Fresh off the rack.", qs: "filter=new" },
  bestsellers: { title: "Bestsellers", blurb: "What everyone is wearing.", qs: "filter=best" },
  sale: { title: "Sale", blurb: "Considered pieces at better prices.", qs: "filter=sale" },
};
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const d = defs[(await params).slug]; return { title: d?.title ?? "Collection", description: d?.blurb }; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const d = defs[(await params).slug]; if (!d) notFound();
  const items = await api<Product[]>(`/products?${d.qs}&limit=100`).catch(() => null);
  return <CollectionView title={d.title} blurb={d.blurb} items={items ?? []} failed={items === null} />;
}
