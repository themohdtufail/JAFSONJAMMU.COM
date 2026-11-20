"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motionOk, finePointer } from "@/lib/fx";
import { Pic } from "./Pic";
import type { Slide } from "@/lib/site";

const PAT = { men: "white", kids: "flame", neutral: "charcoal" } as const;
const SPEED = 6500;

/**
 * The home banners as a 3D carousel: the current banner faces you, its neighbours lean away in depth. The picture floats above the background and
 * follows the pointer a little. It turns by itself, pauses when you hover, focus or hide the tab, and can be swiped, clicked or driven with the arrow keys.
 */
export function Hero({ slides }: { slides: Slide[] }) {
  const n = slides.length; const [i, setI] = useState(0); const [paused, setPaused] = useState(false); const [fx, setFx] = useState(false); const stage = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; id: number } | null>(null); const raf = useRef(0);
  useEffect(() => { setFx(motionOk()); }, []);
  const go = useCallback((d: number) => setI((c) => (c + d + n) % n), [n]);
  useEffect(() => { if (n < 2 || paused || !fx) return; const t = setInterval(() => { if (!document.hidden) go(1); }, SPEED); return () => clearInterval(t); }, [n, paused, fx, go, i]);
  const point = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !fx || !finePointer()) return; const el = stage.current; if (!el) return; const r = el.getBoundingClientRect(); cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { el.style.setProperty("--px", String(((e.clientX - r.left) / r.width - 0.5) * 2)); el.style.setProperty("--py", String(((e.clientY - r.top) / r.height - 0.5) * 2)); });
  };
  const off = (k: number) => { let d = k - i; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };
  return (
    <section className="hero3d wrap" aria-roledescription="carousel" aria-label="Featured" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}>
      <div className={`h3-stage ${n > 1 ? "multi" : ""}`} ref={stage} onPointerMove={point} onPointerLeave={() => { const el = stage.current; if (el) { el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0"); } }}
        onPointerDown={(e) => { if (n > 1 && (e.pointerType === "touch" || e.pointerType === "pen")) drag.current = { x: e.clientX, id: e.pointerId }; }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && d.id === e.pointerId) { const dx = e.clientX - d.x; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } }} onPointerCancel={() => { drag.current = null; }}>
        {slides.map((s, k) => { const d = off(k), active = d === 0; return (
          <article key={s.id} className={`h3-slide hero-card ${s.theme === "kids" ? "kids" : s.theme === "men" ? "men" : "neutral"} ${active ? "is-active" : ""}`} data-pos={Math.abs(d) > 1 ? "far" : d} style={{ "--d": d } as React.CSSProperties}
            role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}`} aria-hidden={!active} {...(!active ? { inert: true } : {})}>
            <div className={`pat ${PAT[s.theme]}`} aria-hidden />
            {s.theme === "kids" && <img className="bear" src="/brand/kids-bear.png" alt="" width={96} height={96} />}
            <div className="hero-copy h3-copy">
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {k === 0 ? <h1>{s.headline}</h1> : <h2>{s.headline}</h2>}
              {s.text && <p className="support">{s.text}</p>}
              {s.ctaLabel && s.ctaHref && <Link href={s.ctaHref} className={`btn ${s.theme === "kids" ? "kids" : s.theme === "men" ? "dark" : "primary"}`}>{s.ctaLabel}</Link>}
            </div>
            {s.image && <div className="h3-art" aria-hidden={!s.image.alt}><span className="h3-float"><Pic m={s.image} alt={s.image.alt} sizes="(min-width:1000px) 38vw, 90vw" priority={k === 0} ratio="4 / 5" w={960} /></span></div>}
          </article>); })}
      </div>
      {n > 1 && <div className="h3-ctl"><button className="h3-btn" onClick={() => go(-1)} aria-label="Previous banner">‹</button>
        <div className="h3-dots" role="group" aria-label="Choose a banner">{slides.map((s, k) => <button key={s.id} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Banner ${k + 1}: ${s.headline}`} aria-current={k === i ? "true" : undefined}>{k === i && fx && !paused && <i style={{ animationDuration: `${SPEED}ms` }} key={i} />}</button>)}</div>
        <button className="h3-btn" onClick={() => go(1)} aria-label="Next banner">›</button></div>}
    </section>
  );
}
