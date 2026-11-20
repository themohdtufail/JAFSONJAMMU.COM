"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { finePointer, motionOk } from "@/lib/fx";

/** Leans toward the pointer in 3D, with a soft light that follows it. Does nothing on touch screens, with reduced motion, or on data saver. */
export function Tilt({ children, className = "", max = 7, as: Tag = "div" }: { children: ReactNode; className?: string; max?: number; as?: "div" | "article" | "span" }) {
  const ref = useRef<HTMLElement>(null); const raf = useRef(0); const on = useRef(false);
  useEffect(() => { on.current = finePointer() && motionOk(); }, []);
  const move = (e: React.PointerEvent) => {
    if (!on.current || e.pointerType !== "mouse") return; const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`); el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`); el.style.setProperty("--gx", `${(x * 100).toFixed(0)}%`); el.style.setProperty("--gy", `${(y * 100).toFixed(0)}%`); el.dataset.tilt = "on"; });
  };
  const leave = () => { const el = ref.current; if (!el) return; cancelAnimationFrame(raf.current); el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); delete el.dataset.tilt; };
  return <Tag ref={ref as never} className={`tilt ${className}`} onPointerMove={move} onPointerLeave={leave}>{children}</Tag>;
}
