export interface Variant { sku: string; colour: string; size: string; pricePaise: number; compareAtPaise: number | null; available: number; stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" }
export interface Product {
  slug: string; name: string; brand: string; description: string; collection: "men" | "kids"; category: string; fabric: string; fit: string;
  pricePaise: number; compareAtPaise: number | null; images: string[]; colours: { name: string; hex: string }[]; sizes: string[];
  variants: Variant[]; isNew: boolean; isBest: boolean; inStock: boolean; fewLeft: boolean; unitsLeft: number | null; related?: Product[];
}
export const inr = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
export const pctOff = (p: { pricePaise: number; compareAtPaise: number | null }) => (p.compareAtPaise ? Math.round((1 - p.pricePaise / p.compareAtPaise) * 100) : 0);
export const variantOf = (p: Product, colour: string, size: string) => p.variants.find((v) => v.colour === colour && v.size === size);

/** Kids sizes are shown as ages ("4-5 yrs"), everything else as stored. */
export const sizeLabel = (s: string) => (/^\d+-\d+Y$/.test(s) ? s.replace("Y", " yrs") : s);
export const isKids = (p: { collection: string }) => p.collection === "kids";
