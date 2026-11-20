import { pages as legacy } from "./default-pages";
import type { Home, Page } from "./schemas";

/** What the storefront shows until the content is edited: the original two section banners, the original wording, and the original announcement. */
export const defaultHome = (): Home => ({
  hero: { slides: [
    { id: "menswear", theme: "men", eyebrow: "Menswear", headline: "Shirts, jackets and tees for every day.", text: "Free delivery above ₹1,999. Cash on delivery available.", ctaLabel: "Shop menswear", ctaHref: "/collections/men", mediaId: null, active: true },
    { id: "kidswear", theme: "kids", eyebrow: "Kidswear", headline: "Cute looks, smart prices.", text: "Soft cotton for 2 to 11 years.", ctaLabel: "Shop kidswear", ctaHref: "/collections/kids", mediaId: null, active: true },
  ] },
  categories: { active: true, eyebrow: "Browse", title: "Shop by category", items: [
    { title: "Blazers", collection: "men", category: "Blazers", mediaId: null }, { title: "T-Shirts", collection: "men", category: "T-Shirts", mediaId: null },
    { title: "Sweatshirts", collection: "men", category: "Sweatshirts", mediaId: null }, { title: "Sets", collection: "kids", category: "Sets", mediaId: null },
  ] },
  newArrivals: { active: true, eyebrow: "Just in", title: "New arrivals" },
  bestsellers: { active: true, eyebrow: "Most bought", title: "Bestsellers" },
  stores: { active: true, eyebrow: "Visit us", title: "In seven stores across Kashmir and Jammu", text: "Jafson Jammu is a multi-brand menswear and kidswear store, online and in stores.", towns: "Srinagar · Jammu · Baramulla · Pulwama · Sopore · Pattan · Pampore", phone: "+91 7006158072" },
});
export const defaultAnnouncement = () => ({ active: true, text: "Free delivery on orders above ₹1,999. Cash on delivery available.", href: "" });
export const defaultPages = (): Record<string, Page> => Object.fromEntries(Object.entries(legacy).map(([k, v]) => [k, { title: v.title, intro: v.intro, sections: v.sections.map(([heading, body]) => ({ heading, body })) }]));
