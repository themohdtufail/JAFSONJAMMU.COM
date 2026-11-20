import { pick, placeholder, srcsetOf, type Media } from "@/lib/img";

/**
 * One picture, loaded the fast way: the right size for the screen (srcset), space reserved so nothing jumps, a blurred preview behind it
 * while it downloads, and lazy loading except for the first picture on the page, which is requested early.
 */
export function Pic({ m, alt, sizes, priority = false, className, ratio = "4 / 5", w = 640 }: { m: Pick<Media, "src" | "srcset" | "width" | "height" | "blur" | "color">; alt: string; sizes: string; priority?: boolean; className?: string; ratio?: string; w?: number }) {
  const [rw, rh] = ratio.split("/").map((n) => Number(n.trim()));
  return <img className={className} src={pick(m, w)} srcSet={srcsetOf(m)} sizes={sizes} alt={alt} width={m.width ?? 800} height={m.height ?? Math.round(((m.width ?? 800) * rh!) / rw!)} loading={priority ? "eager" : "lazy"} decoding={priority ? "sync" : "async"} fetchPriority={priority ? "high" : "auto"} style={{ ...placeholder(m), aspectRatio: ratio, objectFit: "cover" }} />;
}
