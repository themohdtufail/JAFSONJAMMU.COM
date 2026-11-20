import sharp, { type Metadata, type Sharp } from "sharp";

/** Widths the storefront can ask for. A picture gets every width that is smaller than the original, plus the original (capped at 2000px). */
export const WIDTHS = [320, 640, 960, 1440, 2000];
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 60_000_000; // refuses decompression bombs before decoding
const ALLOWED = new Set(["jpeg", "png", "webp", "avif"]);

export class ImageError extends Error { constructor(public code: string, message: string) { super(message); } }
export const widthsFor = (original: number) => [...new Set([...WIDTHS.filter((w) => w < original), Math.min(original, 2000)])].sort((a, b) => a - b);

export interface Processed { width: number; height: number; variants: { w: number; data: Buffer }[]; blur: string; color: string }

/**
 * Validates by what the bytes really are (the declared type is not trusted), turns the picture upright, strips camera and location data,
 * and makes the WebP sizes plus a tiny blurred preview. SVG and animated formats are refused: they can carry scripts or are heavy.
 */
export async function processImage(input: Buffer): Promise<Processed> {
  if (input.length === 0) throw new ImageError("EMPTY_FILE", "That file is empty.");
  if (input.length > MAX_INPUT_BYTES) throw new ImageError("FILE_TOO_LARGE", "Pictures can be up to 12 MB.");
  let base: Sharp, meta: Metadata;
  try { base = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate(); meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata(); }
  catch { throw new ImageError("NOT_AN_IMAGE", "That doesn't look like a picture we can read. Use JPG, PNG, WebP or AVIF."); }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new ImageError("UNSUPPORTED_IMAGE", "Use a JPG, PNG, WebP or AVIF picture.");
  if ((meta.pages ?? 1) > 1) throw new ImageError("UNSUPPORTED_IMAGE", "Animated pictures aren't supported. Use a video instead.");
  const swap = (meta.orientation ?? 1) >= 5; const width = swap ? meta.height! : meta.width!, height = swap ? meta.width! : meta.height!;
  if (!width || !height || width < 200 || height < 200) throw new ImageError("IMAGE_TOO_SMALL", "The picture is too small. Use one that is at least 200 pixels on each side, ideally 1200 or more.");
  const variants: Processed["variants"] = [];
  for (const w of widthsFor(width)) variants.push({ w, data: await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer() });
  const blur = "data:image/webp;base64," + (await base.clone().resize({ width: 16 }).webp({ quality: 30 }).toBuffer()).toString("base64");
  const d = (await base.clone().resize({ width: 64 }).stats()).dominant; const color = "#" + [d.r, d.g, d.b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return { width, height, variants, blur, color };
}
