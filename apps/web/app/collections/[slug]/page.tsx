import { notFound } from "next/navigation";
import { byCollection, categories, products, type Product } from "@/lib/data";
import { CollectionView } from "@/components/CollectionView";

const defs: Record<string, { title: string; blurb: string; list: () => Product[]; cats: string[] }> = {
  men: { title: "Men", blurb: "Tailoring, tees and layers.", list: () => byCollection("men"), cats: categories.men },
  kids: { title: "Kids", blurb: "Comfortable, playful, built to last.", list: () => byCollection("kids"), cats: categories.kids },
  "new-arrivals": { title: "New Arrivals", blurb: "Fresh off the rack.", list: () => products.filter((p) => p.isNew), cats: [] },
  bestsellers: { title: "Bestsellers", blurb: "What everyone is buying.", list: () => products.filter((p) => p.isBest), cats: [] },
  sale: { title: "Sale", blurb: "Limited-time prices.", list: () => products.filter((p) => p.compareAtPaise), cats: [] },
};
export const generateStaticParams = () => Object.keys(defs).map((slug) => ({ slug }));
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const d = defs[(await params).slug]; if (!d) notFound();
  return <CollectionView title={d.title} blurb={d.blurb} items={d.list()} cats={d.cats} />;
}
