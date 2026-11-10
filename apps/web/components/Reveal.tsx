"use client";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = r.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { el.classList.add("in"); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={r} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>{children}</div>;
}
