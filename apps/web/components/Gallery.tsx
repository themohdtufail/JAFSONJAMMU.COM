"use client";
import { useRef, useState } from "react";
import { pick, placeholder, srcsetOf, type Media } from "@/lib/img";
import { Pic } from "./Pic";

/** Product pictures and videos: thumbnails, swipe on touch, hover-to-zoom with a mouse, and a video that only loads when it is chosen. */
export function Gallery({ items, name }: { items: Media[]; name: string }) {
  const [i, setI] = useState(0); const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null); const sx = useRef<number | null>(null);
  const n = items.length; const cur = items[i] ?? items[0]!; const go = (d: number) => setI((c) => (c + d + n) % n);
  const move = (e: React.PointerEvent<HTMLDivElement>) => { if (e.pointerType !== "mouse" || cur.kind !== "IMAGE") return; const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); };
  return (
    <div className="gal">
      {n > 1 && <div className="thumbs">{items.map((m, k) => <button key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={m.kind === "VIDEO" ? `Play video ${k + 1}` : `Show photo ${k + 1}`}>
        <Pic m={m.kind === "VIDEO" && m.poster ? { ...m, src: m.poster, srcset: [] } : m} alt="" sizes="72px" w={160} />{m.kind === "VIDEO" && <span className="play" aria-hidden>▶</span>}</button>)}</div>}
      <div className="gmain" onPointerMove={move} onPointerLeave={() => setZoom(null)} onPointerDown={(e) => { if (e.pointerType !== "mouse") sx.current = e.clientX; }}
        onPointerUp={(e) => { if (sx.current !== null && n > 1) { const dx = e.clientX - sx.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } sx.current = null; }}>
        {cur.kind === "VIDEO"
          ? <video key={i} src={cur.src} poster={cur.poster ?? undefined} controls playsInline preload="none" aria-label={cur.alt || `${name}, video`} />
          : <img key={i} src={pick(cur, 960)} srcSet={srcsetOf(cur)} sizes="(min-width:1100px) 46vw, 100vw" alt={cur.alt || `${name}, photo ${i + 1}`} width={cur.width ?? 800} height={cur.height ?? 1000}
              fetchPriority={i === 0 ? "high" : "auto"} style={{ ...placeholder(cur), ...(zoom ? { transform: "scale(1.9)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : {}) }} />}
        {n > 1 && <><button className="g-nav prev" onClick={() => go(-1)} aria-label="Previous">‹</button><button className="g-nav next" onClick={() => go(1)} aria-label="Next">›</button>
          <span className="g-count" aria-live="polite">{i + 1} / {n}</span></>}
      </div>
    </div>
  );
}
