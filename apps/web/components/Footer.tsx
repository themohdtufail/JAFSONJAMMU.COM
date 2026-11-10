import Link from "next/link";
export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap cols">
        <div><img src="/brand/logo-horizontal-white.png" alt="Jafson" width={150} height={49} /><p>Menswear and kidswear from brands you know.</p></div>
        <div><h2 className="foot-h">Stores</h2><p>Srinagar · Jammu · Baramulla<br />Pulwama · Sopore · Pattan · Pampore</p><h2 className="foot-h">Contact</h2><p><a href="tel:+917006158072">+91 7006158072</a><br /><a href="mailto:jafsonjammu@gmail.com">jafsonjammu@gmail.com</a></p></div>
        <div><h2 className="foot-h">Help</h2><Link href="/track">Track my order</Link><Link href="/returns">Returns and exchange</Link><Link href="/size-guide">Size guide</Link><Link href="/pages/shipping">Shipping</Link><Link href="/pages/faq">FAQs</Link><Link href="/pages/contact">Contact us</Link></div>
        <div><h2 className="foot-h">Follow</h2><p>Instagram: @jafsonjammu<br />Facebook: Jafson Jammu<br />Pinterest: jafson</p><h2 className="foot-h">Company</h2><Link href="/pages/about">About Jafson Jammu</Link><Link href="/pages/privacy">Privacy</Link><Link href="/pages/terms">Terms</Link></div>
      </div>
      <div className="wrap legal">Jafson Jammu is managed by Chameron Industries Private Limited.</div>
    </footer>
  );
}
