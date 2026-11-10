import Link from "next/link";
import { IMG, byCollection, img, products } from "@/lib/data";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";

const words = ["DRESS", "LIKE", "YOU", "MEAN", "IT."];
export default function Home() {
  const fresh = products.filter((p) => p.isNew), best = products.filter((p) => p.isBest).slice(0, 8);
  return (
    <>
      <section className="hero">
        <img className="hero-img" src={img(IMG.camel, 1800)} alt="Model in camel blazer" fetchPriority="high" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow fade" style={{ "--d": "200ms" } as never}>Winter Edit 2026</p>
          <h1>{words.map((w, i) => <span key={w} className="w" style={{ "--d": `${300 + i * 110}ms` } as never}><span>{w}</span></span>)}</h1>
          <div className="hero-cta fade" style={{ "--d": "1000ms" } as never}>
            <Link href="/collections/men" className="btn light">Shop Men</Link>
            <Link href="/collections/kids" className="btn ghost">Shop Kids</Link>
          </div>
        </div>
        <div className="scroll">Scroll</div>
      </section>

      <div className="strip" aria-hidden><div className="marq">{Array.from({ length: 2 }).map((_, k) => <span key={k}>NEW DROPS EVERY FRIDAY ✦ TAILORED IN INDIA ✦ MADE FOR JAMMU WINTERS ✦ COD AVAILABLE ✦ NEW DROPS EVERY FRIDAY ✦ TAILORED IN INDIA ✦ MADE FOR JAMMU WINTERS ✦ COD AVAILABLE ✦ </span>)}</div></div>

      <section className="split">
        {[["Men", "/collections/men", IMG.blazer, "Sharp. Easy. Yours."], ["Kids", "/collections/kids", IMG.boy, "Little looks, big smiles."]].map(([t, h, i, s]) => (
          <Link key={t} href={h!} className="tile"><img src={img(i!, 1200)} alt={`${t} collection`} loading="lazy" /><div><h2>{t}</h2><p>{s}</p><span>Explore →</span></div></Link>
        ))}
      </section>

      <section className="sec">
        <Reveal><div className="sec-head"><h2>New arrivals</h2><Link href="/collections/new-arrivals">View all →</Link></div></Reveal>
        <div className="hscroll">{fresh.map((p) => <div className="hs" key={p.slug}><ProductCard p={p} /></div>)}</div>
      </section>

      <section className="sec cats">
        <Reveal><div className="sec-head"><h2>Shop by category</h2></div></Reveal>
        <div className="catgrid">
          {[["Blazers", IMG.suit, "men"], ["T-Shirts", IMG.tee, "men"], ["Sweatshirts", IMG.pink, "men"], ["Kids Sets", IMG.boy, "kids"]].map(([n, i, c], k) => (
            <Reveal key={n} delay={k * 90}><Link href={`/collections/${c}?cat=${encodeURIComponent(n!.replace("Kids ", ""))}`} className="cat"><img src={img(i!, 700)} alt={n} loading="lazy" /><span>{n}</span></Link></Reveal>
          ))}
        </div>
      </section>

      <section className="sec">
        <Reveal><div className="sec-head"><h2>Bestsellers</h2><Link href="/collections/bestsellers">View all →</Link></div></Reveal>
        <div className="grid">{best.map((p, i) => <Reveal key={p.slug} delay={(i % 4) * 80}><ProductCard p={p} /></Reveal>)}</div>
      </section>

      <section className="story" style={{ backgroundImage: `url(${img(IMG.hills, 1800)})` }}>
        <Reveal className="story-in"><p className="eyebrow">Our story</p><h2>Made in the mountains.<br /><em>Worn everywhere.</em></h2>
          <p>JAFSON began on a single showroom floor in Jammu. We still design like we're dressing our neighbours: honest fabrics, clean cuts, fair prices.</p><Link href="/collections/men" className="btn light">Discover the collection</Link></Reveal>
      </section>

      <section className="news"><Reveal><h2>Get 10% off your first order</h2><p>Join the list for early access to drops.</p>
        <form action="#"><input type="email" required placeholder="Your email" aria-label="Email" /><button className="btn">Subscribe</button></form></Reveal></section>
    </>
  );
}
