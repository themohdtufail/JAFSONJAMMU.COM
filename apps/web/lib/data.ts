export type Collection = "men" | "kids";
export interface Product {
  slug: string; name: string; collection: Collection; category: string;
  pricePaise: number; compareAtPaise?: number; images: string[];
  colours: { name: string; hex: string }[]; sizes: string[]; soldOut?: string[];
  isNew?: boolean; isBest?: boolean; fabric: string; fit: string; description: string;
}
const u = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${w}`;
export const IMG = {
  hills: "1490578474895-699cd4e2cf59", kids: "1503944583220-79d8926ad5e2", suit: "1507679799987-c73779587ccf",
  pink: "1516826957135-700dedea698c", boy: "1519238263530-99bdd11df2ea", tee: "1521572163474-6864f9cf17ab",
  camel: "1552374196-1ab2a1c593e8", knits: "1558769132-cb1aea458c5e", check: "1594938298603-c8148c4dae35",
  kidshirt: "1596755094514-f87e34085b2c", blazer: "1617137968427-85924c800a22",
};
export const img = u;
const M = ["S", "M", "L", "XL", "XXL"], K = ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"];
const c = (name: string, hex: string) => ({ name, hex });
const p = (x: Omit<Product, "images"> & { imgs: string[] }): Product => ({ ...x, images: x.imgs.map((i) => u(i)) });

export const products: Product[] = [
  p({ slug: "tailored-navy-blazer", name: "Tailored Navy Blazer", collection: "men", category: "Blazers", pricePaise: 459900, compareAtPaise: 699900, imgs: [IMG.blazer, IMG.suit], colours: [c("Navy", "#1c2b4a"), c("Charcoal", "#2b2b2b")], sizes: M, isNew: true, isBest: true, fabric: "Poly-viscose blend", fit: "Slim fit", description: "A sharp, structured blazer cut close to the body. Half-canvassed chest, notch lapels and a clean finish that works from boardroom to wedding." }),
  p({ slug: "windowpane-check-suit", name: "Windowpane Check Three-Piece", collection: "men", category: "Blazers", pricePaise: 899900, compareAtPaise: 1299900, imgs: [IMG.check, IMG.suit], colours: [c("Steel Blue", "#51739b")], sizes: M, isBest: true, fabric: "Wool blend", fit: "Tailored fit", description: "Blazer, waistcoat and trousers in a confident windowpane check. Made for winter weddings and big meetings." }),
  p({ slug: "camel-overcoat-blazer", name: "Camel Relaxed Blazer", collection: "men", category: "Jackets", pricePaise: 379900, compareAtPaise: 549900, imgs: [IMG.camel, IMG.hills], colours: [c("Camel", "#b98a56"), c("Olive", "#6b7048")], sizes: M, isNew: true, fabric: "Cotton twill", fit: "Relaxed fit", description: "Unlined, easy and warm in tone. Layer it over a tee and keep the rest simple." }),
  p({ slug: "essential-white-tee", name: "Essential White Tee", collection: "men", category: "T-Shirts", pricePaise: 79900, compareAtPaise: 99900, imgs: [IMG.tee, IMG.camel], colours: [c("White", "#f4f1ea"), c("Black", "#1d1d1d"), c("Olive", "#6b7048")], sizes: M, isBest: true, isNew: true, fabric: "240 GSM combed cotton", fit: "Regular fit", description: "The heavyweight tee that holds its shape. Pre-shrunk, double-stitched, no logo." }),
  p({ slug: "blush-crew-sweatshirt", name: "Blush Crew Sweatshirt", collection: "men", category: "Sweatshirts", pricePaise: 189900, compareAtPaise: 259900, imgs: [IMG.pink, IMG.hills], colours: [c("Blush", "#d9b8b0"), c("Charcoal", "#2f2f2f")], sizes: M, soldOut: ["XXL"], isNew: true, fabric: "French terry cotton", fit: "Oversized fit", description: "Soft brushed-back terry with a dropped shoulder. Worn-in feel from day one." }),
  p({ slug: "distressed-light-wash-jeans", name: "Light Wash Distressed Jeans", collection: "men", category: "Jeans", pricePaise: 199900, compareAtPaise: 299900, imgs: [IMG.pink, IMG.hills], colours: [c("Light Wash", "#9fb6cf")], sizes: ["28", "30", "32", "34", "36"], isBest: true, fabric: "Stretch denim", fit: "Straight fit", description: "Mid-rise, straight leg with hand-finished distressing. Stretch for all-day comfort." }),
  p({ slug: "terracotta-henley-tee", name: "Terracotta Henley Tee", collection: "men", category: "T-Shirts", pricePaise: 99900, imgs: [IMG.hills, IMG.tee], colours: [c("Terracotta", "#a4492b"), c("Sage", "#9aa385")], sizes: M, isNew: true, fabric: "Slub cotton", fit: "Regular fit", description: "Textured slub cotton with a three-button placket. Earthy tone, easy shape." }),
  p({ slug: "oatmeal-knit-layer", name: "Oatmeal Cable Knit", collection: "men", category: "Sweatshirts", pricePaise: 249900, compareAtPaise: 349900, imgs: [IMG.knits, IMG.camel], colours: [c("Oatmeal", "#d8cdb9"), c("Rust", "#8a4a2b")], sizes: M, fabric: "Acrylic wool blend", fit: "Regular fit", description: "Chunky cable knit for cold Jammu mornings. Warm without the weight." }),
  p({ slug: "slate-formal-shirt", name: "Slate Formal Shirt", collection: "men", category: "Shirts", pricePaise: 129900, imgs: [IMG.suit, IMG.check], colours: [c("White", "#f7f7f4"), c("Sky", "#bcd2e6")], sizes: M, isBest: true, fabric: "Cotton poplin", fit: "Slim fit", description: "Crisp poplin with a clean collar that sits right under a blazer." }),
  p({ slug: "city-bomber-jacket", name: "City Weekend Jacket", collection: "men", category: "Jackets", pricePaise: 329900, compareAtPaise: 459900, imgs: [IMG.camel, IMG.blazer], colours: [c("Tan", "#a97c50")], sizes: M, fabric: "Cotton canvas", fit: "Regular fit", description: "Lightweight jacket with a soft collar and deep pockets." }),

  p({ slug: "boys-navy-cardigan-set", name: "Boys Navy Cardigan Set", collection: "kids", category: "Sets", pricePaise: 149900, compareAtPaise: 219900, imgs: [IMG.boy, IMG.kids], colours: [c("Navy", "#22305a")], sizes: K, isNew: true, isBest: true, fabric: "Soft acrylic knit", fit: "Regular fit", description: "A smart cardigan with contrast piping, paired with bright cuffed shorts. Party-ready and easy to wash." }),
  p({ slug: "boys-henley-tee", name: "Boys Cream Henley", collection: "kids", category: "T-Shirts", pricePaise: 59900, compareAtPaise: 79900, imgs: [IMG.kids, IMG.boy], colours: [c("Cream", "#e8e2d2"), c("Olive", "#6b7048")], sizes: K, isBest: true, fabric: "Organic cotton", fit: "Regular fit", description: "Soft organic cotton with a chest pocket. Built for playgrounds." }),
  p({ slug: "kids-graphic-tee", name: "Girls Graphic Tee", collection: "kids", category: "T-Shirts", pricePaise: 49900, imgs: [IMG.kids, IMG.kidshirt], colours: [c("Grey", "#c7c4bd"), c("Sage", "#9aa385")], sizes: K, isNew: true, fabric: "Combed cotton", fit: "Regular fit", description: "Playful print on breathable cotton. Colours stay bright wash after wash." }),
  p({ slug: "kids-chambray-shirt", name: "Kids Star Chambray Shirt", collection: "kids", category: "Shirts", pricePaise: 89900, compareAtPaise: 119900, imgs: [IMG.kidshirt, IMG.boy], colours: [c("Chambray", "#5b7690")], sizes: K, isBest: true, fabric: "Cotton chambray", fit: "Regular fit", description: "Little stars on soft chambray. Dress it up or down." }),
  p({ slug: "kids-party-bow-set", name: "Boys Party Bow Set", collection: "kids", category: "Sets", pricePaise: 179900, compareAtPaise: 249900, imgs: [IMG.boy, IMG.kidshirt], colours: [c("Navy", "#22305a"), c("Royal", "#2447b8")], sizes: K, soldOut: ["10-11Y"], fabric: "Cotton blend", fit: "Regular fit", description: "Shirt, bow tie and shorts, ready for the next celebration." }),
  p({ slug: "kids-everyday-set", name: "Kids Everyday Layer Set", collection: "kids", category: "Sets", pricePaise: 129900, imgs: [IMG.kids, IMG.hills], colours: [c("Stone", "#cfc6b4")], sizes: K, isNew: true, fabric: "Cotton fleece", fit: "Relaxed fit", description: "Two-piece comfort set for school runs and weekend adventures." }),
];

export const categories = {
  men: ["Blazers", "Jackets", "Shirts", "T-Shirts", "Sweatshirts", "Jeans"],
  kids: ["Sets", "Shirts", "T-Shirts"],
};
export const inr = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
export const pctOff = (p: Product) => (p.compareAtPaise ? Math.round((1 - p.pricePaise / p.compareAtPaise) * 100) : 0);
export const bySlug = (s: string) => products.find((p) => p.slug === s);
export const byCollection = (c: Collection) => products.filter((p) => p.collection === c);
