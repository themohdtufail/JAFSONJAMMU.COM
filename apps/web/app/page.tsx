import Link from "next/link";
import { api } from "@/lib/api";
import { inr, type Product } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";

export const dynamic = "force-dynamic";
const img = (id: string, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${w}`;

export default async function Home() {
  const products = await api<Product[]>("/products?limit=100").catch(() => [] as Product[]);
  const fresh = products.filter((p) => p.isNew), best = products.filter((p) => p.isBest).slice(0, 8);
  const lowest = products.length ? Math.min(...products.map((p) => p.pricePaise)) : 0;
  return (
    <>
      <section className="wrap hero-grid" aria-label="Shop by section">
        <div className="hero-card men">
          <div className="pat white" aria-hidden />
          <div className="hero-copy">
            <p className="eyebrow">Menswear</p>
            <h1>Shirts, jackets and tees for every day.</h1>
            {lowest > 0 && <p className="support">Prices from {inr(lowest)}. Free delivery above ₹1,999.</p>}
            <Link href="/collections/men" className="btn dark">Shop menswear</Link>
          </div>
        </div>
        <div className="hero-card kids">
          <div className="pat flame" aria-hidden />
          <img className="bear" src="/brand/kids-bear.png" alt="" width={96} height={96} />
          <div className="hero-copy">
            <p className="eyebrow">Kidswear</p>
            <h2>Cute looks, smart prices.</h2>
            <p className="support">Soft cotton for 2 to 11 years.</p>
            <Link href="/collections/kids" className="btn kids">Shop kidswear</Link>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Just in</p><h2>New arrivals</h2></div><Link href="/collections/new-arrivals" className="ulink">View all</Link></div></Reveal>
        <div className="hscroll">{fresh.map((p) => <div className="hs" key={p.slug}><ProductCard p={p} /></div>)}</div>
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Browse</p><h2>Shop by category</h2></div></div></Reveal>
        <div className="catgrid">
          {[["Blazers", "1507679799987-c73779587ccf", "men"], ["T-Shirts", "1521572163474-6864f9cf17ab", "men"], ["Sweatshirts", "1516826957135-700dedea698c", "men"], ["Sets", "1519238263530-99bdd11df2ea", "kids"]].map(([n, i, c]) => (
            <Link key={n} href={`/collections/${c}?cat=${encodeURIComponent(n!)}`} className={`cat ${c === "kids" ? "kids" : ""}`}><span className="cat-img"><img src={img(i!, 640)} alt="" loading="lazy" width={640} height={800} /></span><span className="cat-name"><small>{c === "kids" ? "Kids" : "Men"}</small>{n}</span></Link>
          ))}
        </div>
      </section>

      <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">Most bought</p><h2>Bestsellers</h2></div><Link href="/collections/bestsellers" className="ulink">View all</Link></div></Reveal>
        <div className="grid">{best.map((p, i) => <ProductCard key={p.slug} p={p} priority={i < 4} />)}</div>
        {products.length === 0 && <p className="empty">We can't load products right now. Refresh in a moment.</p>}
      </section>

      <section className="stores">
        <div className="wrap stores-in">
          <div><p className="eyebrow">Visit us</p><h2>In seven stores across Kashmir and Jammu</h2></div>
          <div><p className="body-lg">Jafson Jammu is a multi-brand menswear and kidswear store, online and in stores.</p>
            <p className="towns">Srinagar · Jammu · Baramulla · Pulwama · Sopore · Pattan · Pampore</p>
            <p><a className="ulink" href="tel:+917006158072">Call +91 7006158072</a></p></div>
        </div>
      </section>
    </>
  );
}
