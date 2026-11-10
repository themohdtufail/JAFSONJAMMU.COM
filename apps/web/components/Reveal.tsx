"use client";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = r.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={r} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>{children}</div>;
}
