/** What the API sends for each picture or video of a product. Pictures that are only a web address have just `src`. */
export interface Media { kind: "IMAGE" | "VIDEO"; alt: string; src: string; srcset: { w: number; url: string }[]; width: number | null; height: number | null; blur: string | null; color: string | null; poster: string | null }
type Pic = Pick<Media, "src"> & Partial<Pick<Media, "srcset">>;
export const WIDTHS = [320, 480, 640, 960, 1280];

/** Unsplash serves any size on request, so the demo photos are fetched at the width needed (and as WebP) instead of at full size. */
export function sized(url: string, w: number): string {
  if (!/^https:\/\/images\.unsplash\.com\//.test(url)) return url;
  try { const u = new URL(url); u.searchParams.set("w", String(w)); u.searchParams.set("q", "70"); u.searchParams.set("auto", "format"); u.searchParams.set("fit", "crop"); u.searchParams.delete("h"); return u.toString(); } catch { return url; }
}
/** The smallest stored size that is at least `w` wide. */
export function pick(m: Pic, w: number): string {
  if (m.srcset?.length) return (m.srcset.find((s) => s.w >= w) ?? m.srcset[m.srcset.length - 1]!).url;
  return sized(m.src, w);
}
/** `srcset` attribute: the browser downloads the width that fits the screen and its pixel density, not the biggest file. */
export function srcsetOf(m: Pic, widths = WIDTHS): string | undefined {
  if (m.srcset?.length) return m.srcset.map((s) => `${s.url} ${s.w}w`).join(", ");
  return /^https:\/\/images\.unsplash\.com\//.test(m.src) ? widths.map((w) => `${sized(m.src, w)} ${w}w`).join(", ") : undefined;
}
/** Placeholder painted behind a loading picture: a tiny blurred copy when we have one, else the dominant colour. */
export const placeholder = (m: Pick<Media, "blur" | "color">): { backgroundColor: string; backgroundImage?: string } => ({ backgroundColor: m.color ?? "#ece9e4", ...(m.blur ? { backgroundImage: `url(${m.blur})` } : {}) });
/** Product pictures only (no videos), main picture first. Falls back to the plain image list for older data. */
export const pictures = (p: { media?: Media[]; images: string[]; name: string }): Media[] => { const m = (p.media ?? []).filter((x) => x.kind === "IMAGE"); return m.length ? m : p.images.map((src) => ({ kind: "IMAGE" as const, alt: p.name, src, srcset: [], width: null, height: null, blur: null, color: null, poster: null })); };
