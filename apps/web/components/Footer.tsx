import Link from "next/link";
export function Footer() {
  return (
    <footer className="foot">
      <div className="perks">{[["Free shipping", "On orders above ₹1,999"], ["Cash on delivery", "Pay when it arrives"], ["Easy returns", "7-day hassle-free exchange"], ["Showroom pickup", "Collect from JAFSON Jammu"]].map(([a, b]) => <div key={a}><b>{a}</b><span>{b}</span></div>)}</div>
      <div className="cols">
        <div><div className="logo big">JAFSON<small>JAMMU</small></div><p>Men's and kids' clothing from the heart of Jammu. Designed for the way you live.</p></div>
        <div><h5>Shop</h5><Link href="/collections/men">Men</Link><Link href="/collections/kids">Kids</Link><Link href="/collections/new-arrivals">New arrivals</Link><Link href="/collections/sale">Sale</Link></div>
        <div><h5>Help</h5><Link href="/">Track order</Link><Link href="/">Shipping</Link><Link href="/">Returns & exchange</Link><Link href="/">Size guide</Link></div>
        <div><h5>Visit us</h5><p>JAFSON Showroom<br />Jammu, J&K, India</p></div>
      </div>
      <p className="legal">© {new Date().getFullYear()} JAFSON JAMMU · A Chameron Industries Pvt. Ltd. brand</p>
    </footer>
  );
}
