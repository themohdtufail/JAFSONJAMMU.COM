import Link from "next/link";
export function Footer() {
  return (
    <footer className="foot">
      <div className="perks">{[["Free shipping", "On orders above ₹1,999"], ["Cash on delivery", "Pay when it arrives"], ["Easy returns", "7-day hassle-free exchange"], ["Showroom pickup", "Collect from JAFSON Jammu"]].map(([a, b]) => <div key={a}><b>{a}</b><span>{b}</span></div>)}</div>
      <div className="cols">
        <div><div className="logo big">JAFSON<small>JAMMU</small></div><p>Men's and kids' clothing from the heart of Jammu. Designed for the way you live.</p><p>JAFSON Showroom<br />Jammu, J&K, India</p></div>
        <div><h5>Shop</h5><Link href="/collections/men">Men</Link><Link href="/collections/kids">Kids</Link><Link href="/collections/new-arrivals">New arrivals</Link><Link href="/collections/sale">Sale</Link></div>
        <div><h5>Help</h5><Link href="/track">Track order</Link><Link href="/returns">Returns & exchange</Link><Link href="/size-guide">Size guide</Link><Link href="/pages/shipping">Shipping</Link><Link href="/pages/faq">FAQs</Link><Link href="/pages/contact">Contact</Link></div>
        <div><h5>Company</h5><Link href="/pages/about">About JAFSON</Link><Link href="/pages/returns">Returns policy</Link><Link href="/pages/privacy">Privacy</Link><Link href="/pages/terms">Terms</Link><Link href="/account">My account</Link></div>
      </div>
      <p className="legal">© {new Date().getFullYear()} JAFSON JAMMU · A Chameron Industries Pvt. Ltd. brand</p>
    </footer>
  );
}
