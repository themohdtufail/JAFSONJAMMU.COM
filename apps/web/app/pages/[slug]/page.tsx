import { notFound } from "next/navigation";
import Link from "next/link";
import { pages } from "@/lib/content";
export const generateStaticParams = () => Object.keys(pages).map((slug) => ({ slug }));
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const d = pages[(await params).slug]; if (!d) notFound();
  return (<><section className="banner"><h1>{d.title}</h1><p>{d.intro}</p></section>
    <article className="prose">{d.sections.map(([h, b]) => <section key={h}><h2>{h}</h2><p>{b}</p></section>)}
      <p className="legal-links">{Object.entries(pages).map(([k, v]) => <Link key={k} href={`/pages/${k}`}>{v.title}</Link>)}</p></article></>);
}
