import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";
import { CollectionView } from "@/components/CollectionView";

export const dynamic = "force-dynamic";
const defs: Record<string, { title: string; blurb: string; qs: string; kids?: boolean }> = {
  all: { title: "All products", blurb: "Menswear and kidswear.", qs: "" },
  men: { title: "Men", blurb: "Shirts, jackets, tees and jeans.", qs: "collection=men" },
  kids: { title: "Kids", blurb: "Soft cotton tees for 2 to 11 years.", qs: "collection=kids", kids: true },
  "new-arrivals": { title: "New arrivals", blurb: "The latest pieces in store.", qs: "filter=new" },
  bestsellers: { title: "Bestsellers", blurb: "What customers buy most.", qs: "filter=best" },
  sale: { title: "Sale", blurb: "Reduced prices. The saving is shown on each product.", qs: "filter=sale" },
};
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const d = defs[(await params).slug]; return { title: d?.title ?? "Collection", description: d?.blurb }; }
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const slug = (await params).slug; const d = defs[slug]; if (!d) notFound();
  const raw = (await searchParams).q; const q = slug === "all" && typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  const items = await api<Product[]>(`/products?${d.qs ? d.qs + "&" : ""}${q ? `q=${encodeURIComponent(q)}&` : ""}limit=100`).catch(() => null);
  return <CollectionView title={q ? `Results for “${q}”` : d.title} blurb={q ? `${items?.length ?? 0} ${items?.length === 1 ? "product" : "products"} found.` : d.blurb} items={items ?? []} failed={items === null} kids={!!d.kids} />;
}
