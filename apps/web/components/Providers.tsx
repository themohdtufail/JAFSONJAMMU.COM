"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Product, Variant } from "@/lib/data";

export interface BagLine { sku: string; quantity: number; slug: string; name: string; image: string; colour: string; size: string; pricePaise: number }
export interface User { id: string; phone: string; name: string | null; email: string | null }
type Tokens = { accessToken: string; refreshToken: string };
interface Toast { id: number; text: string; kind: "ok" | "err" }

interface Ctx {
  bag: BagLine[]; wishlist: string[]; bagOpen: boolean; searchOpen: boolean; count: number; subtotalPaise: number; bump: number;
  add(p: Product, v: Variant): void; setQty(sku: string, q: number): void; clear(): void;
  toggleWish(slug: string): void; setBagOpen(b: boolean): void; setSearchOpen(b: boolean): void;
  user: User | null; authReady: boolean; signIn(t: Tokens, u: User): void; signOut(): void; setUser(u: User): void;
  authApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  toast(text: string, kind?: "ok" | "err"): void; toasts: Toast[];
}
const C = createContext<Ctx>(null as never);
export const useShop = () => useContext(C);

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
function save(k: string, v: unknown) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export function Providers({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<BagLine[]>([]); const [wishlist, setWish] = useState<string[]>([]);
  const [bagOpen, setBagOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null); const [authReady, setAuthReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]); const [bump, setBump] = useState(0);
  const tokens = useRef<Tokens | null>(null); const ready = useRef(false);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random(); setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const signOut = useCallback(() => { const rt = tokens.current?.refreshToken; tokens.current = null; save("jf-auth", null); setUser(null); if (rt) api("/auth/logout", { method: "POST", body: { refreshToken: rt } }).catch(() => {}); }, []);
  const signIn = useCallback((t: Tokens, u: User) => { tokens.current = t; save("jf-auth", t); setUser(u); }, []);

  const authApi = useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    try { return await api<T>(path, { ...init, token: tokens.current?.accessToken }); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401 && tokens.current) {
        try {
          const t = await api<Tokens & { expiresIn: number }>("/auth/refresh", { method: "POST", body: { refreshToken: tokens.current.refreshToken } });
          tokens.current = { accessToken: t.accessToken, refreshToken: t.refreshToken }; save("jf-auth", tokens.current);
          return await api<T>(path, { ...init, token: t.accessToken });
        } catch { signOut(); }
      }
      throw e;
    }
  }, [signOut]);

  useEffect(() => {
    setBag(load("jf-bag-v2", [])); setWish(load("jf-wish", []));
    const t = load<Tokens | null>("jf-auth", null); tokens.current = t; ready.current = true;
    if (t) api<User>("/auth/me", { token: t.accessToken }).then(setUser).catch(() => authApi<User>("/auth/me").then(setUser).catch(() => {})).finally(() => setAuthReady(true)); else setAuthReady(true);
  }, [authApi]);
  useEffect(() => { if (ready.current) { save("jf-bag-v2", bag); save("jf-wish", wishlist); } }, [bag, wishlist]);

  // Signed-in customers keep their bag and wishlist on the server, so they follow them across devices. The browser copy stays the working copy;
  // at sign-in the two are merged, afterwards each change is sent on. A failed request never blocks shopping: the next change tries again.
  const bagRef = useRef(bag); bagRef.current = bag; const wishRef = useRef(wishlist); wishRef.current = wishlist;
  const synced = useRef<string | null>(null); const sentBag = useRef(new Map<string, number>()); const sentWish = useRef(new Set<string>());
  useEffect(() => {
    if (!user) { synced.current = null; return; } if (synced.current === user.id) return; synced.current = user.id;
    (async () => {
      try {
        const cart = await authApi<{ items: { sku: string; quantity: number; slug: string; name: string; colour: string; size: string; pricePaise: number; image: string | null }[] }>("/cart/merge", { method: "POST", body: { lines: bagRef.current.map(({ sku, quantity }) => ({ sku, quantity })) } });
        const next: BagLine[] = cart.items.map((i) => ({ sku: i.sku, quantity: i.quantity, slug: i.slug, name: i.name, image: i.image ?? "", colour: i.colour, size: i.size, pricePaise: i.pricePaise }));
        sentBag.current = new Map(next.map((l) => [l.sku, l.quantity])); setBag(next);
        for (const slug of wishRef.current) await authApi(`/wishlist/${slug}`, { method: "PUT" }).catch(() => {});
        const wl = await authApi<{ slug: string }[]>("/wishlist"); sentWish.current = new Set(wl.map((x) => x.slug)); setWish(wl.map((x) => x.slug));
      } catch { synced.current = null; /* try again next time the user changes */ }
    })();
  }, [user, authApi]);
  useEffect(() => {
    if (!user || synced.current !== user.id) return;
    const now = new Map(bag.map((l) => [l.sku, l.quantity]));
    for (const [sku, q] of now) if (sentBag.current.get(sku) !== q) { sentBag.current.set(sku, q); authApi("/cart/items", { method: "PUT", body: { sku, quantity: q } }).catch(() => sentBag.current.delete(sku)); }
    for (const sku of [...sentBag.current.keys()]) if (!now.has(sku)) { sentBag.current.delete(sku); authApi("/cart/items", { method: "PUT", body: { sku, quantity: 0 } }).catch(() => {}); }
    const w = new Set(wishlist);
    for (const slug of w) if (!sentWish.current.has(slug)) { sentWish.current.add(slug); authApi(`/wishlist/${slug}`, { method: "PUT" }).catch(() => sentWish.current.delete(slug)); }
    for (const slug of [...sentWish.current]) if (!w.has(slug)) { sentWish.current.delete(slug); authApi(`/wishlist/${slug}`, { method: "DELETE" }).catch(() => {}); }
  }, [bag, wishlist, user, authApi]);

  const add = useCallback((p: Product, v: Variant) => {
    if (v.available <= 0) return;
    setBag((b) => {
      const i = b.findIndex((x) => x.sku === v.sku);
      if (i >= 0) return b.map((x, j) => (j === i ? { ...x, quantity: Math.min(10, v.available, x.quantity + 1) } : x));
      return [...b, { sku: v.sku, quantity: 1, slug: p.slug, name: p.name, image: p.images[0] ?? "", colour: v.colour, size: v.size, pricePaise: v.pricePaise }];
    });
    setBump((n) => n + 1); setBagOpen(true);
  }, []);
  const setQty = useCallback((sku: string, q: number) => setBag((b) => (q <= 0 ? b.filter((x) => x.sku !== sku) : b.map((x) => (x.sku === sku ? { ...x, quantity: Math.min(10, q) } : x)))), []);
  const toggleWish = useCallback((s: string) => setWish((w) => { const on = w.includes(s); toast(on ? "Removed from wishlist" : "Saved to wishlist"); return on ? w.filter((x) => x !== s) : [...w, s]; }), [toast]);

  const value = useMemo<Ctx>(() => ({
    bag, wishlist, bagOpen, searchOpen, bump, add, setQty, clear: () => setBag([]), toggleWish, setBagOpen, setSearchOpen,
    count: bag.reduce((n, l) => n + l.quantity, 0), subtotalPaise: bag.reduce((n, l) => n + l.quantity * l.pricePaise, 0),
    user, authReady, signIn, signOut, setUser, authApi, toast, toasts,
  }), [bag, wishlist, bagOpen, searchOpen, bump, add, setQty, toggleWish, user, authReady, signIn, signOut, authApi, toast, toasts]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
