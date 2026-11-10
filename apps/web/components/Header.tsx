"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShop } from "./Providers";
const links: [string, string][] = [["New", "/collections/new-arrivals"], ["Men", "/collections/men"], ["Kids", "/collections/kids"], ["Bestsellers", "/collections/bestsellers"], ["Sale", "/collections/sale"]];
export function Header() {
  const { count, wishlist, setBagOpen, setSearchOpen } = useShop();
  const [hide, setHide] = useState(false); const [menu, setMenu] = useState(false); const [solid, setSolid] = useState(false); const last = useRef(0); const home = usePathname() === "/";
  useEffect(() => {
    const f = () => { const y = window.scrollY; setHide(y > last.current && y > 200); setSolid(y > 20); last.current = y; };
    window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <>
      <div className="announce"><div className="marq"><span>FREE SHIPPING ABOVE ₹1,999 &nbsp;•&nbsp; CASH ON DELIVERY AVAILABLE &nbsp;•&nbsp; PICK UP FROM OUR JAMMU SHOWROOM &nbsp;•&nbsp; EASY 7-DAY RETURNS &nbsp;•&nbsp; </span><span aria-hidden>FREE SHIPPING ABOVE ₹1,999 &nbsp;•&nbsp; CASH ON DELIVERY AVAILABLE &nbsp;•&nbsp; PICK UP FROM OUR JAMMU SHOWROOM &nbsp;•&nbsp; EASY 7-DAY RETURNS &nbsp;•&nbsp; </span></div></div>
      <header className={`hdr ${hide ? "hide" : ""} ${solid || !home ? "solid" : ""}`}>
        <button className="burger" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}><i /><i /></button>
        <nav className={`nav ${menu ? "open" : ""}`} onClick={() => setMenu(false)}>
          {links.map(([n, h]) => <Link key={n} href={h}>{n}</Link>)}
        </nav>
        <Link href="/" className="logo" aria-label="JAFSON Jammu home">JAFSON<small>JAMMU</small></Link>
        <div className="icons">
          <button onClick={() => setSearchOpen(true)} aria-label="Search">Search</button>
          <Link href="/account">Account</Link>
          <Link href="/wishlist" aria-label="Wishlist">♥{wishlist.length > 0 && <sup>{wishlist.length}</sup>}</Link>
          <button onClick={() => setBagOpen(true)} aria-label={`Bag, ${count} items`}>Bag<sup>{count}</sup></button>
        </div>
      </header>
    </>
  );
}
