"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useShop } from "./Providers";

const links: [string, string, string][] = [["Men", "/collections/men", "men"], ["Kids", "/collections/kids", "kids"], ["Brands", "/brands", "brands"], ["Sale", "/collections/sale", "sale"]];
const Bag = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 7h12l1 13H5L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>;
const Search = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
const Heart = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.4-8.6-8.8C2.4 8.4 4 5.500 6.800 5.500c1.800 0 3.200.9 5.200 3 2-2.100 3.400-3 5.200-3 2.800 0 4.400 2.900 3.400 5.700C19 15.600 12 20 12 20z" /></svg>;
const User = () => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1.200-4 4.200-5.500 8-5.500s6.800 1.500 8 5.500" /></svg>;

export function Header() {
  const { count, wishlist, setBagOpen, setSearchOpen, bump, user } = useShop();
  const path = usePathname(); const [menu, setMenu] = useState(false); const [bar, setBar] = useState(true);
  useEffect(() => { try { if (sessionStorage.getItem("jf-bar") === "x") setBar(false); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => { document.body.style.overflow = menu ? "hidden" : ""; }, [menu]);
  const dismiss = () => { setBar(false); try { sessionStorage.setItem("jf-bar", "x"); } catch { /* ignore */ } };
  const on = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <>
      {bar && <div className="announce"><p>Free delivery on orders above ₹1,999. Cash on delivery available.</p><button onClick={dismiss} aria-label="Dismiss announcement">✕</button></div>}
      <header className="hdr">
        <div className="hdr-in wrap">
          <button className="burger" onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu}><i /><i /><i /></button>
          <Link href="/" className="logo" aria-label="Jafson Jammu, home"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={110} height={36} /></Link>
          <nav className={`nav ${menu ? "open" : ""}`} aria-label="Primary">
            {links.map(([n, h]) => <Link key={n} href={h} className={on(h) ? "cur" : ""} aria-current={on(h) ? "page" : undefined}>{n}</Link>)}
            <div className="nav-extra"><Link href="/collections/new-arrivals">New arrivals</Link><Link href="/track">Track my order</Link><Link href="/size-guide">Size guide</Link><Link href="/pages/contact">Contact</Link></div>
          </nav>
          <button className="search-box" onClick={() => setSearchOpen(true)} aria-label="Search"><Search /><span>Search shirts, jeans, brands</span></button>
          <div className="icons">
            <button className="only-s" onClick={() => setSearchOpen(true)} aria-label="Search"><Search /></button>
            <Link href="/account" aria-label={user ? "My account" : "Sign in"} className="hide-s"><User /></Link>
            <Link href="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved`} className="hide-s"><Heart />{wishlist.length > 0 && <sup>{wishlist.length}</sup>}</Link>
            <button onClick={() => setBagOpen(true)} aria-label={`Bag, ${count} items`}><Bag /><sup key={bump} className={count ? "show" : ""}>{count}</sup></button>
          </div>
        </div>
      </header>
    </>
  );
}
