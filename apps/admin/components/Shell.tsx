"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { adm, getToken, setToken } from "@/lib/api";

export interface Me { id: string; name: string; role: "STAFF" | "MANAGER" | "OWNER"; mfaEnabled?: boolean; mfaRequired?: boolean }
const RANK = { STAFF: 1, MANAGER: 2, OWNER: 3 };
interface Ctx { me: Me | null; refreshMe(): Promise<void>; can(min: Me["role"]): boolean; signOut(): void; toast(t: string, kind?: "ok" | "err"): void }
const C = createContext<Ctx>(null as never);
export const useAdmin = () => useContext(C);

const NAV: { href: string; label: string; min: Me["role"]; icon: string }[] = [
  { href: "/", label: "Dashboard", min: "STAFF", icon: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z" },
  { href: "/orders", label: "Orders", min: "STAFF", icon: "M6 2l-3 4v14h18V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" },
  { href: "/inventory", label: "Inventory", min: "STAFF", icon: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" },
  { href: "/products", label: "Products", min: "STAFF", icon: "M20 12l-8 8-9-9V3h8zM7.500 7.500h.01" },
  { href: "/returns", label: "Returns", min: "STAFF", icon: "M3 12a9 9 0 109-9 9.700 9.700 0 00-6.700 2.800L3 8M3 3v5h5" },
  { href: "/customers", label: "Customers", min: "STAFF", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.900M16 3.100a4 4 0 010 7.800" },
  { href: "/store-ops", label: "Store operations", min: "MANAGER", icon: "M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 20v-6h6v6" },
  { href: "/gst", label: "GST report", min: "MANAGER", icon: "M9 14l6-6M9.500 8.500h.01M14.500 13.500h.01M5 3h14a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 012-2z" },
  { href: "/audit", label: "Audit log", min: "MANAGER", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { href: "/security", label: "Security", min: "STAFF", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" },
  { href: "/staff", label: "Staff", min: "OWNER", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.400 15a1.700 1.700 0 00.3 1.800l.1.100a2 2 0 11-2.800 2.800l-.1-.1a1.700 1.700 0 00-1.800-.3 1.700 1.700 0 00-1 1.500V21a2 2 0 11-4 0v-.1a1.700 1.700 0 00-1.100-1.500 1.700 1.700 0 00-1.800.3l-.1.100a2 2 0 11-2.800-2.800l.1-.1a1.700 1.700 0 00.3-1.800 1.700 1.700 0 00-1.500-1H3a2 2 0 110-4h.1a1.700 1.700 0 001.500-1.100 1.700 1.700 0 00-.3-1.800l-.1-.1a2 2 0 112.800-2.800l.1.100a1.700 1.700 0 001.800.3H9a1.700 1.700 0 001-1.500V3a2 2 0 114 0v.1a1.700 1.700 0 001 1.500 1.700 1.700 0 001.800-.3l.1-.1a2 2 0 112.800 2.800l-.1.100a1.700 1.700 0 00-.3 1.800V9a1.700 1.700 0 001.500 1H21a2 2 0 110 4h-.1a1.700 1.700 0 00-1.500 1z" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [me, setMe] = useState<Me | null>(null); const [ready, setReady] = useState(false); const [open, setOpen] = useState(false); const [toasts, setToasts] = useState<{ id: number; t: string; k: string }[]>([]);
  const bare = path === "/login" || path.endsWith("/slip") || path.endsWith("/tags");
  const toast = useCallback((t: string, k: "ok" | "err" = "ok") => { const id = Date.now() + Math.random(); setToasts((x) => [...x.slice(-2), { id, t, k }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3800); }, []);
  const signOut = useCallback(() => { setToken(null); setMe(null); router.replace("/login"); }, [router]);
  useEffect(() => {
    if (path === "/login") { setReady(true); return; }
    if (!getToken()) { router.replace("/login"); return; }
    adm<Me>("/admin/me").then((m) => { setMe(m); setReady(true); if (m.mfaRequired && !m.mfaEnabled && path !== "/security") router.replace("/security"); }).catch(() => {});
  }, [path, router]);
  const refreshMe = useCallback(async () => { setMe(await adm<Me>("/admin/me")); }, []);
  useEffect(() => { setOpen(false); }, [path]);
  const can = (min: Me["role"]) => !!me && RANK[me.role] >= RANK[min];
  const ctx: Ctx = { me, refreshMe, can, signOut, toast };
  if (!ready || (!bare && !me)) return <div className="boot">Loading…</div>;
  return (
    <C.Provider value={ctx}>
      {bare ? children : (
        <div className="app">
          <aside className={`side ${open ? "open" : ""}`}>
            <div className="brand"><img src="/brand/logo-horizontal-white.png" alt="Jafson" width={132} height={43} /><small>Back-office</small></div>
            <nav>{NAV.filter((n) => can(n.min)).map((n) => (
              <Link key={n.href} href={n.href} className={(n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "on" : ""}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={n.icon} /></svg>{n.label}</Link>))}</nav>
            <div className="who"><b>{me!.name}</b><span>{me!.role.toLowerCase()}</span><button onClick={signOut}>Sign out</button></div>
          </aside>
          <div className="main">
            <header className="top"><button className="menu" onClick={() => setOpen(!open)} aria-label="Menu">☰</button><span>Jafson Jammu back-office</span><a href="http://localhost:3000" target="_blank" rel="noreferrer">View storefront ↗</a></header>
            <main>{children}</main>
          </div>
          {open && <div className="scrim" onClick={() => setOpen(false)} />}
        </div>
      )}
      <div className="toasts" role="status" aria-live="polite">{toasts.map((x) => <div key={x.id} className={`toast ${x.k}`}>{x.t}</div>)}</div>
    </C.Provider>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className="phead"><div><h1>{title.split(/(JF\d+)/).map((t, i) => (/^JF\d+$/.test(t) ? <span key={i} className="id">{t}</span> : t))}</h1>{sub && <p>{sub}</p>}</div><div className="pact">{children}</div></div>;
}
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`modal-in ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="mh"><h2>{title}</h2><button onClick={onClose} aria-label="Close">✕</button></div>{children}</div></div>;
}
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(""); const [n, setN] = useState(0);
  useEffect(() => { let live = true; setErr(""); fn().then((d) => live && setData(d)).catch((e) => live && setErr(e?.message ?? "Failed to load")); return () => { live = false; }; /* eslint-disable-next-line */ }, [...deps, n]);
  return { data, err, reload: () => setN((x) => x + 1), setData };
}
