import Link from "next/link";
const HELP = ["shipping", "faq", "contact"], CO = ["about", "privacy", "terms"], SKIP = ["returns"];
export function Footer({ pages }: { pages: { slug: string; title: string }[] }) {
  const pg = (slug: string) => pages.find((x) => x.slug === slug); const extra = pages.filter((x) => ![...HELP, ...CO, ...SKIP].includes(x.slug));
  return (
    <footer className="foot">
      <div className="wrap cols">
        <div><img src="/brand/logo-horizontal-white.png" alt="Jafson" width={150} height={49} /><p>Menswear and kidswear from brands you know.</p></div>
        <div><h2 className="foot-h">Stores</h2><p>Srinagar · Jammu · Baramulla<br />Pulwama · Sopore · Pattan · Pampore</p><h2 className="foot-h">Contact</h2><p><a href="tel:+917006158072">+91 7006158072</a><br /><a href="mailto:jafsonjammu@gmail.com">jafsonjammu@gmail.com</a></p></div>
        <div><h2 className="foot-h">Help</h2><Link href="/track">Track my order</Link><Link href="/returns">Returns and exchange</Link><Link href="/size-guide">Size guide</Link>{HELP.map((k) => pg(k)).filter(Boolean).map((x) => <Link key={x!.slug} href={`/pages/${x!.slug}`}>{x!.title}</Link>)}</div>
        <div><h2 className="foot-h">Follow</h2><p>Instagram: @jafsonjammu<br />Facebook: Jafson Jammu<br />Pinterest: jafson</p><h2 className="foot-h">Company</h2>{[...CO.map((k) => pg(k)), ...extra].filter(Boolean).map((x) => <Link key={x!.slug} href={`/pages/${x!.slug}`}>{x!.title}</Link>)}</div>
      </div>
      <div className="wrap legal">Jafson Jammu is managed by Chameron Industries Private Limited.</div>
    </footer>
  );
}
