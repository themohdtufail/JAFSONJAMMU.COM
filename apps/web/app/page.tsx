import Link from "next/link";
import { api } from "@/lib/api";
import type { Product } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";

export const dynamic = "force-dynamic";
const img = (id: string, w = 1600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${w}`;
const words = ["Dress", "like", "you", "mean", "it."];

export default async function Home() {
  const products = await api<Product[]>("/products?limit=100").catch(() => [] as Product[]);
  const fresh = products.filter((p) => p.isNew), best = products.filter((p) => p.isBest).slice(0, 8);
  return (
    <>
      <section className="hero">
        <img className="hero-img" src={img("1552374196-1ab2a1c593e8", 2000)} alt="Model wearing a camel blazer over a white tee" fetchPriority="high" />
        <div className="hero-shade" />
        <div className="wrap hero-copy">
          <p className="eyebrow light fade" style={{ "--d": "250ms" } as never}>The Winter Edit · 2026</p>
          <h1 aria-label="Dress like you mean it.">{words.map((w, i) => <span key={w} className="w" aria-hidden style={{ "--d": `${350 + i * 120}ms` } as never}><span>{w}</span></span>)}</h1>
          <div className="hero-cta fade" style={{ "--d": "1100ms" } as never}>
            <Link href="/collections/men" className="btn light">Shop men</Link>
            <Link href="/collections/kids" className="btn ghost">Shop kids</Link>
          </div>
        </div>
        <div className="scroll" aria-hidden>Scroll</div>
      </section>

      <div className="strip" aria-hidden><div className="marq">{Array.from({ length: 4 }).map((_, k) => <span key={k}>New pieces every Friday&nbsp;&nbsp;✦&nbsp;&nbsp;Tailored in India&nbsp;&nbsp;✦&nbsp;&nbsp;Made for Jammu winters&nbsp;&nbsp;✦&nbsp;&nbsp;Cash on delivery&nbsp;&nbsp;✦&nbsp;&nbsp;</span>)}</div></div>

      <section className="split">
        {[["Men", "/collections/men", "1617137968427-85924c800a22", "Sharp. Easy. Yours."], ["Kids", "/collections/kids", "1519238263530-99bdd11df2ea", "Little looks, big smiles."]].map(([t, h, i, s]) => (
          <Link key={t} href={h!} className="tile"><img src={img(i!, 1200)} alt={`${t} collection`} loading="lazy" /><div><p className="eyebrow light">Collection</p><h2>{t}</h2><p>{s}</p><span className="ulink light">Explore</span></div></Link>
        ))}
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Just landed</p><h2>New arrivals</h2></div><Link href="/collections/new-arrivals" className="ulink">View all</Link></div></Reveal>
        <div className="hscroll">{fresh.map((p) => <div className="hs" key={p.slug}><ProductCard p={p} /></div>)}</div>
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Browse</p><h2>Shop by category</h2></div></div></Reveal>
        <div className="catgrid">
          {[["Blazers", "1507679799987-c73779587ccf", "men"], ["T-Shirts", "1521572163474-6864f9cf17ab", "men"], ["Sweatshirts", "1516826957135-700dedea698c", "men"], ["Sets", "1519238263530-99bdd11df2ea", "kids"]].map(([n, i, c], k) => (
            <Reveal key={n} delay={k * 90}><Link href={`/collections/${c}?cat=${encodeURIComponent(n!)}`} className="cat"><img src={img(i!, 700)} alt="" loading="lazy" /><span><small>{c === "kids" ? "Kids" : "Men"}</small>{n}</span></Link></Reveal>
          ))}
        </div>
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Most loved</p><h2>Bestsellers</h2></div><Link href="/collections/bestsellers" className="ulink">View all</Link></div></Reveal>
        <div className="grid">{best.map((p, i) => <Reveal key={p.slug} delay={(i % 4) * 80}><ProductCard p={p} /></Reveal>)}</div>
        {products.length === 0 && <p className="empty">We're having trouble loading products. Please refresh in a moment.</p>}
      </section>

      <section className="story" style={{ backgroundImage: `url(${img("1490578474895-699cd4e2cf59", 2000)})` }}>
        <Reveal className="story-in"><p className="eyebrow light">Our story</p><h2>Made in the mountains.<br /><em>Worn everywhere.</em></h2>
          <p>JAFSON began on a single showroom floor in Jammu. We still design like we're dressing our neighbours: honest fabrics, clean cuts and fair prices.</p><Link href="/pages/about" className="btn light">Read our story</Link></Reveal>
      </section>

      <section className="news"><Reveal><p className="eyebrow light">Stay in touch</p><h2>Early access to every drop</h2><p>Join the list and be first to know about new pieces and showroom events.</p>
        <form action="#" className="news-form"><input type="email" required placeholder="Your email address" aria-label="Email address" /><button className="btn light">Subscribe</button></form></Reveal></section>
    </>
  );
}
