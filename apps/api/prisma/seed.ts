import { PrismaClient } from "@prisma/client";
try { process.loadEnvFile(); } catch {}
const db = new PrismaClient();
const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=900`;
const I = { hills: "1490578474895-699cd4e2cf59", kids: "1503944583220-79d8926ad5e2", suit: "1507679799987-c73779587ccf", pink: "1516826957135-700dedea698c", boy: "1519238263530-99bdd11df2ea", tee: "1521572163474-6864f9cf17ab", camel: "1552374196-1ab2a1c593e8", knits: "1558769132-cb1aea458c5e", check: "1594938298603-c8148c4dae35", kidshirt: "1596755094514-f87e34085b2c", blazer: "1617137968427-85924c800a22" };
const M = ["S", "M", "L", "XL", "XXL"], K = ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"], J = ["28", "30", "32", "34", "36"];
const c = (name: string, hex: string) => ({ name, hex });
type S = { slug: string; name: string; col: "men" | "kids"; cat: string; price: number; was?: number; imgs: string[]; colours: { name: string; hex: string }[]; sizes: string[]; out?: string[]; isNew?: boolean; isBest?: boolean; fabric: string; fit: string; desc: string };
const seed: S[] = [
  { slug: "tailored-navy-blazer", name: "Tailored Navy Blazer", col: "men", cat: "Blazers", price: 459900, was: 699900, imgs: [I.blazer, I.suit], colours: [c("Navy", "#1c2b4a"), c("Charcoal", "#2b2b2b")], sizes: M, isNew: true, isBest: true, fabric: "Poly-viscose blend", fit: "Slim fit", desc: "A sharp, structured blazer cut close to the body. Half-canvassed chest, notch lapels and a clean finish that works from boardroom to wedding." },
  { slug: "windowpane-check-suit", name: "Windowpane Check Three-Piece", col: "men", cat: "Blazers", price: 899900, was: 1299900, imgs: [I.check, I.suit], colours: [c("Steel Blue", "#51739b")], sizes: M, isBest: true, fabric: "Wool blend", fit: "Tailored fit", desc: "Blazer, waistcoat and trousers in a confident windowpane check. Made for winter weddings and big meetings." },
  { slug: "camel-overcoat-blazer", name: "Camel Relaxed Blazer", col: "men", cat: "Jackets", price: 379900, was: 549900, imgs: [I.camel, I.hills], colours: [c("Camel", "#b98a56"), c("Olive", "#6b7048")], sizes: M, isNew: true, fabric: "Cotton twill", fit: "Relaxed fit", desc: "Unlined, easy and warm in tone. Layer it over a tee and keep the rest simple." },
  { slug: "essential-white-tee", name: "Essential White Tee", col: "men", cat: "T-Shirts", price: 79900, was: 99900, imgs: [I.tee, I.camel], colours: [c("White", "#f4f1ea"), c("Black", "#1d1d1d"), c("Olive", "#6b7048")], sizes: M, isBest: true, isNew: true, fabric: "240 GSM combed cotton", fit: "Regular fit", desc: "The heavyweight tee that holds its shape. Pre-shrunk, double-stitched, no logo." },
  { slug: "blush-crew-sweatshirt", name: "Blush Crew Sweatshirt", col: "men", cat: "Sweatshirts", price: 189900, was: 259900, imgs: [I.pink, I.hills], colours: [c("Blush", "#d9b8b0"), c("Charcoal", "#2f2f2f")], sizes: M, out: ["XXL"], isNew: true, fabric: "French terry cotton", fit: "Oversized fit", desc: "Soft brushed-back terry with a dropped shoulder. Worn-in feel from day one." },
  { slug: "distressed-light-wash-jeans", name: "Light Wash Distressed Jeans", col: "men", cat: "Jeans", price: 199900, was: 299900, imgs: [I.pink, I.hills], colours: [c("Light Wash", "#9fb6cf")], sizes: J, isBest: true, fabric: "Stretch denim", fit: "Straight fit", desc: "Mid-rise, straight leg with hand-finished distressing. Stretch for all-day comfort." },
  { slug: "terracotta-henley-tee", name: "Terracotta Henley Tee", col: "men", cat: "T-Shirts", price: 99900, imgs: [I.hills, I.tee], colours: [c("Terracotta", "#a4492b"), c("Sage", "#9aa385")], sizes: M, isNew: true, fabric: "Slub cotton", fit: "Regular fit", desc: "Textured slub cotton with a three-button placket. Earthy tone, easy shape." },
  { slug: "oatmeal-knit-layer", name: "Oatmeal Cable Knit", col: "men", cat: "Sweatshirts", price: 249900, was: 349900, imgs: [I.knits, I.camel], colours: [c("Oatmeal", "#d8cdb9"), c("Rust", "#8a4a2b")], sizes: M, fabric: "Acrylic wool blend", fit: "Regular fit", desc: "Chunky cable knit for cold Jammu mornings. Warm without the weight." },
  { slug: "slate-formal-shirt", name: "Slate Formal Shirt", col: "men", cat: "Shirts", price: 129900, imgs: [I.suit, I.check], colours: [c("White", "#f7f7f4"), c("Sky", "#bcd2e6")], sizes: M, isBest: true, fabric: "Cotton poplin", fit: "Slim fit", desc: "Crisp poplin with a clean collar that sits right under a blazer." },
  { slug: "city-bomber-jacket", name: "City Weekend Jacket", col: "men", cat: "Jackets", price: 329900, was: 459900, imgs: [I.camel, I.blazer], colours: [c("Tan", "#a97c50")], sizes: M, fabric: "Cotton canvas", fit: "Regular fit", desc: "Lightweight jacket with a soft collar and deep pockets." },
  { slug: "boys-navy-cardigan-set", name: "Boys Navy Cardigan Set", col: "kids", cat: "Sets", price: 149900, was: 219900, imgs: [I.boy, I.kids], colours: [c("Navy", "#22305a")], sizes: K, isNew: true, isBest: true, fabric: "Soft acrylic knit", fit: "Regular fit", desc: "A smart cardigan with contrast piping, paired with bright cuffed shorts. Party-ready and easy to wash." },
  { slug: "boys-henley-tee", name: "Boys Cream Henley", col: "kids", cat: "T-Shirts", price: 59900, was: 79900, imgs: [I.kids, I.boy], colours: [c("Cream", "#e8e2d2"), c("Olive", "#6b7048")], sizes: K, isBest: true, fabric: "Organic cotton", fit: "Regular fit", desc: "Soft organic cotton with a chest pocket. Built for playgrounds." },
  { slug: "kids-graphic-tee", name: "Girls Graphic Tee", col: "kids", cat: "T-Shirts", price: 49900, imgs: [I.kids, I.kidshirt], colours: [c("Grey", "#c7c4bd"), c("Sage", "#9aa385")], sizes: K, isNew: true, fabric: "Combed cotton", fit: "Regular fit", desc: "Playful print on breathable cotton. Colours stay bright wash after wash." },
  { slug: "kids-chambray-shirt", name: "Kids Star Chambray Shirt", col: "kids", cat: "Shirts", price: 89900, was: 119900, imgs: [I.kidshirt, I.boy], colours: [c("Chambray", "#5b7690")], sizes: K, isBest: true, fabric: "Cotton chambray", fit: "Regular fit", desc: "Little stars on soft chambray. Dress it up or down." },
  { slug: "kids-party-bow-set", name: "Boys Party Bow Set", col: "kids", cat: "Sets", price: 179900, was: 249900, imgs: [I.boy, I.kidshirt], colours: [c("Navy", "#22305a"), c("Royal", "#2447b8")], sizes: K, out: ["10-11Y"], fabric: "Cotton blend", fit: "Regular fit", desc: "Shirt, bow tie and shorts, ready for the next celebration." },
  { slug: "kids-everyday-set", name: "Kids Everyday Layer Set", col: "kids", cat: "Sets", price: 129900, imgs: [I.kids, I.hills], colours: [c("Stone", "#cfc6b4")], sizes: K, isNew: true, fabric: "Cotton fleece", fit: "Relaxed fit", desc: "Two-piece comfort set for school runs and weekend adventures." },
];

async function main() {
  const loc = await db.inventoryLocation.upsert({ where: { code: "JAFSON_JAMMU_SHOWROOM" }, update: {}, create: { code: "JAFSON_JAMMU_SHOWROOM", name: "JAFSON Jammu Showroom" } });
  const cats = new Map<string, string>();
  for (const [i, s] of seed.entries()) {
    const ck = `${s.col}-${s.cat}`.toLowerCase().replace(/[^a-z]+/g, "-");
    if (!cats.has(ck)) cats.set(ck, (await db.category.upsert({ where: { slug: ck }, update: {}, create: { slug: ck, name: s.cat, collection: s.col, sortOrder: cats.size } })).id);
    const p = await db.product.upsert({ where: { slug: s.slug }, update: {}, create: { slug: s.slug, name: s.name, description: s.desc, collection: s.col, categoryId: cats.get(ck)!, fabric: s.fabric, fit: s.fit, isNew: !!s.isNew, isBest: !!s.isBest, sortOrder: i, images: { create: s.imgs.map((x, n) => ({ url: u(x), sortOrder: n })) } } });
    for (const [ci, col] of s.colours.entries()) for (const [si, size] of s.sizes.entries()) {
      const sku = `JF${String(i + 1).padStart(3, "0")}-${col.name.replace(/\W/g, "").slice(0, 3).toUpperCase()}-${size}`;
      const v = await db.productVariant.upsert({ where: { sku }, update: {}, create: { productId: p.id, sku, colourName: col.name, colourHex: col.hex, size, pricePaise: s.price, compareAtPaise: s.was ?? null, costPricePaise: Math.round(s.price * 0.45) } });
      const qty = s.out?.includes(size) ? 0 : 3 + ((i * 7 + si * 3 + ci * 5) % 13);
      await db.inventoryBalance.upsert({ where: { locationId_variantId: { locationId: loc.id, variantId: v.id } }, update: {}, create: { locationId: loc.id, variantId: v.id, onHand: qty } });
    }
  }
  for (let n = 180001; n <= 180022; n++) await db.serviceablePincode.upsert({ where: { pincode: String(n) }, update: {}, create: { pincode: String(n), deliveryType: "LOCAL", feePaise: 4900 } });
  console.log(`seeded ${seed.length} products`);
}
main().finally(() => db.$disconnect());
