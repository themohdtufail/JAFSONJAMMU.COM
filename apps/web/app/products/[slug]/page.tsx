import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Product } from "@/lib/data";
import { ProductDetail } from "@/components/ProductDetail";

export const dynamic = "force-dynamic";
const get = (slug: string) => api<Product>(`/products/${slug}`).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e; });
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const p = await get((await params).slug).catch(() => null); return p ? { title: p.name, description: p.description, openGraph: { images: p.images.slice(0, 1) } } : { title: "Product" }; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await get((await params).slug); if (!p) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description, image: p.images, offers: { "@type": "Offer", priceCurrency: "INR", price: p.pricePaise / 100, availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } };
  return (<><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /><ProductDetail p={p} /></>);
}
