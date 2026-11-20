import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { pages as builtIn } from "@/lib/content";
import { getPage, getPagesIndex, type PageContent } from "@/lib/site";

export const revalidate = 60;
/** The page as edited in the back office; if the API can't be reached the built-in wording is shown instead of an error. */
async function load(slug: string): Promise<PageContent | null> {
  try { return await getPage(slug); } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    const d = builtIn[slug]; return d ? { slug, title: d.title, intro: d.intro, sections: d.sections.map(([heading, body]) => ({ heading, body })) } : null;
  }
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const d = await load((await params).slug); return { title: d?.title ?? "Page", description: d?.intro }; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug; const [d, index] = await Promise.all([load(slug), getPagesIndex()]); if (!d) notFound();
  return (<><section className="banner slim"><p className="eyebrow">JAFSON</p><h1>{d.title}</h1>{d.intro && <p className="lede">{d.intro}</p>}</section>
    <article className="wrap prose">{d.sections.map((s) => <section key={s.heading}><h2>{s.heading}</h2>{s.body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</section>)}
      <p className="legal-links">{index.map((x) => <Link key={x.slug} href={`/pages/${x.slug}`}>{x.title}</Link>)}</p></article></>);
}
