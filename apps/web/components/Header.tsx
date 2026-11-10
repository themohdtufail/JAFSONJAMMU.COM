"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShop } from "./Providers";

const links: [string, string][] = [["New", "/collections/new-arrivals"], ["Men", "/collections/men"], ["Kids", "/collections/kids"], ["Bestsellers", "/collections/bestsellers"], ["Sale", "/collections/sale"]];
const Bag = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>;
const Search = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>;
const Heart = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M12 20s-7-4.4-8.6-8.8C2.4 8.4 4 5.5 6.8 5.5c1.8 0 3.2.9 5.2 3 2-2.100 3.400-3 5.200-3 2.800 0 4.400 2.900 3.400 5.700C19 15.600 12 20 12 20z"/></svg>;
const User = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="12" cy="8" r="4"/><path d="M4 20c1.200-4 4.200-5.500 8-5.500s6.800 1.500 8 5.500"/></svg>;

export function Header() {
  const { count, wishlist, setBagOpen, setSearchOpen, bump, user } = useShop();
  const path = usePathname(); const home = path === "/";
  const [hide, setHide] = useState(false); const [menu, setMenu] = useState(false); const [scrolled, setScrolled] = useState(false); const last = useRef(0);
  useEffect(() => {
    const f = () => { const y = window.scrollY; setHide(y > last.current + 4 && y > 240); if (y < last.current - 4) setHide(false); setScrolled(y > 30); last.current = y; };
    f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => { document.body.style.overflow = menu ? "hidden" : ""; }, [menu]);
  const solid = scrolled || !home || menu;
  const msg = "Complimentary shipping above ₹1,999   ·   Cash on delivery   ·   Collect from our Jammu showroom   ·   7-day easy returns   ·   ";
  return (
    <>
      <div className="announce" aria-label="Offers"><div className="marq"><span>{msg}</span><span aria-hidden>{msg}</span><span aria-hidden>{msg}</span><span aria-hidden>{msg}</span></div></div>
      <header className={`hdr ${hide ? "hide" : ""} ${solid ? "solid" : ""}`}>
        <div className="hdr-in">
          <button className="burger" onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu}><i /><i /><i /></button>
          <nav className={`nav ${menu ? "open" : ""}`} aria-label="Primary">
            {links.map(([n, h]) => <Link key={n} href={h} className={path === h ? "cur" : ""}>{n}</Link>)}
            <div className="nav-extra"><Link href="/track">Track order</Link><Link href="/size-guide">Size guide</Link><Link href="/pages/contact">Contact</Link></div>
          </nav>
          <Link href="/" className="logo" aria-label="JAFSON Jammu, home">JAFSON<small>JAMMU</small></Link>
          <div className="icons">
            <button onClick={() => setSearchOpen(true)} aria-label="Search"><Search /></button>
            <Link href="/account" aria-label={user ? "My account" : "Sign in"} className="hide-s"><User /></Link>
            <Link href="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved`} className="hide-s"><Heart />{wishlist.length > 0 && <sup>{wishlist.length}</sup>}</Link>
            <button onClick={() => setBagOpen(true)} aria-label={`Bag, ${count} items`}><Bag /><sup key={bump} className={count ? "show" : ""}>{count}</sup></button>
          </div>
        </div>
      </header>
    </>
  );
}
