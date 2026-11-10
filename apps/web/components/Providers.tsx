"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { bySlug } from "@/lib/data";

export interface BagLine { slug: string; size: string; colour: string; qty: number }
interface Ctx {
  bag: BagLine[]; wishlist: string[]; bagOpen: boolean; searchOpen: boolean;
  add(l: Omit<BagLine, "qty">): void; setQty(i: number, q: number): void; clear(): void;
  toggleWish(slug: string): void; setBagOpen(b: boolean): void; setSearchOpen(b: boolean): void;
  count: number; subtotalPaise: number;
}
const C = createContext<Ctx>(null as never);
export const useShop = () => useContext(C);

function load<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } }

export function Providers({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<BagLine[]>([]);
  const [wishlist, setWish] = useState<string[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setBag(load("jf-bag", [])); setWish(load("jf-wish", [])); setReady(true); }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("jf-bag", JSON.stringify(bag)); localStorage.setItem("jf-wish", JSON.stringify(wishlist)); } catch {} }, [bag, wishlist, ready]);
  const add = useCallback((l: Omit<BagLine, "qty">) => {
    setBag((b) => { const i = b.findIndex((x) => x.slug === l.slug && x.size === l.size && x.colour === l.colour);
      return i >= 0 ? b.map((x, j) => (j === i ? { ...x, qty: Math.min(10, x.qty + 1) } : x)) : [...b, { ...l, qty: 1 }]; });
    setBagOpen(true);
  }, []);
  const setQty = useCallback((i: number, q: number) => setBag((b) => (q <= 0 ? b.filter((_, j) => j !== i) : b.map((x, j) => (j === i ? { ...x, qty: Math.min(10, q) } : x)))), []);
  const toggleWish = useCallback((s: string) => setWish((w) => (w.includes(s) ? w.filter((x) => x !== s) : [...w, s])), []);
  const value = useMemo<Ctx>(() => ({
    bag, wishlist, bagOpen, searchOpen, add, setQty, clear: () => setBag([]), toggleWish, setBagOpen, setSearchOpen,
    count: bag.reduce((n, l) => n + l.qty, 0),
    subtotalPaise: bag.reduce((n, l) => n + l.qty * (bySlug(l.slug)?.pricePaise ?? 0), 0),
  }), [bag, wishlist, bagOpen, searchOpen, add, setQty, toggleWish]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
