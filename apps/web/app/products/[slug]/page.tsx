import { notFound } from "next/navigation";
import { bySlug, products } from "@/lib/data";
import { ProductDetail } from "@/components/ProductDetail";
export const generateStaticParams = () => products.map((p) => ({ slug: p.slug }));
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = bySlug((await params).slug); if (!p) notFound();
  return <ProductDetail p={p} related={products.filter((x) => x.collection === p.collection && x.slug !== p.slug).slice(0, 4)} />;
}
