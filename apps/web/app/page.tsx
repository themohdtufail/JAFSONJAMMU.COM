import Link from "next/link";
import { apiCached } from "@/lib/api";
import { inr, type Product } from "@/lib/data";
import { getHome } from "@/lib/site";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Hero } from "@/components/Hero";
import { Pic } from "@/components/Pic";
import { Tilt } from "@/components/Tilt";

export const revalidate = 60;
const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70&w=640`;
const FALLBACK_IMG: Record<string, string> = { Blazers: "1507679799987-c73779587ccf", "T-Shirts": "1521572163474-6864f9cf17ab", Sweatshirts: "1516826957135-700dedea698c", Sets: "1519238263530-99bdd11df2ea" };
const MARQUEE = ["Free delivery above ₹1,999", "Cash on delivery", "7-day returns & exchange", "Pick up at our showroom", "Same-day delivery in Jammu"];

export default async function Home() {
  const [home, products] = await Promise.all([getHome(), apiCached<Product[]>("/products?limit=100").catch(() => [] as Product[])]);
  const fresh = products.filter((p) => p.isNew), best = products.filter((p) => p.isBest).slice(0, 8);
  const lowest = products.length ? Math.min(...products.map((p) => p.pricePaise)) : 0;
  const slides = home.hero.slides.map((s, i) => (i === 0 && lowest > 0 && s.theme === "men" && !s.text ? { ...s, text: `Prices from ${inr(lowest)}. Free delivery above ₹1,999.` } : s));
  const { categories: cats, newArrivals, bestsellers, stores } = home;
  return (
    <>
      <Hero slides={slides} />
      <div className="marquee" aria-hidden><div className="mq-track">{[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>{t}</span>)}</div></div>

      {newArrivals.active && fresh.length > 0 && <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">{newArrivals.eyebrow}</p><h2>{newArrivals.title}</h2></div><Link href="/collections/new-arrivals" className="ulink">View all</Link></div></Reveal>
        <div className="hscroll">{fresh.map((p, i) => <div className="hs" key={p.slug}><ProductCard p={p} priority={i < 2} /></div>)}</div>
      </section>}

      {cats.active && cats.items.length > 0 && <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">{cats.eyebrow}</p><h2>{cats.title}</h2></div></div></Reveal>
        <div className="catgrid">
          {cats.items.map((t) => (
            <Tilt key={t.title} className={`cat ${t.collection === "kids" ? "kids" : ""}`}><Link href={`/collections/${t.collection}?cat=${encodeURIComponent(t.category)}`} className="cat-a">
              <span className="cat-img">{t.image ? <Pic m={t.image} alt="" sizes="(min-width:1000px) 22vw, 47vw" w={640} />
                : FALLBACK_IMG[t.category] ? <img src={img(FALLBACK_IMG[t.category]!)} alt="" loading="lazy" decoding="async" width={640} height={800} /> : null}</span>
              <span className="cat-name"><small>{t.collection === "kids" ? "Kids" : "Men"}</small>{t.title}</span></Link></Tilt>
          ))}
        </div>
      </section>}

      {bestsellers.active && <section className="section wrap">
        <Reveal><div className="sec-head"><div><p className="eyebrow">{bestsellers.eyebrow}</p><h2>{bestsellers.title}</h2></div><Link href="/collections/bestsellers" className="ulink">View all</Link></div></Reveal>
        <div className="grid">{best.map((p, i) => <ProductCard key={p.slug} p={p} priority={i < 2} />)}</div>
        {products.length === 0 && <p className="empty">We can't load products right now. Refresh in a moment.</p>}
      </section>}

      {stores.active && <section className="stores">
        <div className="wrap stores-in">
          <div><p className="eyebrow">{stores.eyebrow}</p><h2>{stores.title}</h2></div>
          <div><p className="body-lg">{stores.text}</p>
            <p className="towns">{stores.towns}</p>
            {stores.phone && <p><a className="ulink" href={`tel:${stores.phone.replace(/[^\d+]/g, "")}`}>Call {stores.phone}</a></p>}</div>
        </div>
      </section>}
    </>
  );
}
