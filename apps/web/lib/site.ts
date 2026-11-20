import { apiCached } from "./api";
import type { Media } from "./img";

/** Editable content (home banners, announcement, pages) as the API serves it. If the API can't be reached the original wording is shown, so the shop is never blank. */
export interface Slide { id: string; theme: "men" | "kids" | "neutral"; eyebrow: string; headline: string; text: string; ctaLabel: string; ctaHref: string; image: (Pick<Media, "src" | "srcset" | "width" | "height" | "blur" | "color" | "alt">) | null }
export interface Tile { title: string; collection: "men" | "kids"; category: string; image: Slide["image"] }
export interface Block { active: boolean; eyebrow: string; title: string }
export interface HomeContent { hero: { slides: Slide[] }; categories: Block & { items: Tile[] }; newArrivals: Block; bestsellers: Block; stores: Block & { text: string; towns: string; phone: string } }
export interface Announcement { active: boolean; text: string; href: string }
export interface PageContent { slug: string; title: string; intro: string; sections: { heading: string; body: string }[] }

const FALLBACK_HOME: HomeContent = {
  hero: { slides: [
    { id: "menswear", theme: "men", eyebrow: "Menswear", headline: "Shirts, jackets and tees for every day.", text: "Free delivery above ₹1,999. Cash on delivery available.", ctaLabel: "Shop menswear", ctaHref: "/collections/men", image: null },
    { id: "kidswear", theme: "kids", eyebrow: "Kidswear", headline: "Cute looks, smart prices.", text: "Soft cotton for 2 to 11 years.", ctaLabel: "Shop kidswear", ctaHref: "/collections/kids", image: null },
  ] },
  categories: { active: true, eyebrow: "Browse", title: "Shop by category", items: [
    { title: "Blazers", collection: "men", category: "Blazers", image: null }, { title: "T-Shirts", collection: "men", category: "T-Shirts", image: null },
    { title: "Sweatshirts", collection: "men", category: "Sweatshirts", image: null }, { title: "Sets", collection: "kids", category: "Sets", image: null },
  ] },
  newArrivals: { active: true, eyebrow: "Just in", title: "New arrivals" }, bestsellers: { active: true, eyebrow: "Most bought", title: "Bestsellers" },
  stores: { active: true, eyebrow: "Visit us", title: "In seven stores across Kashmir and Jammu", text: "Jafson Jammu is a multi-brand menswear and kidswear store, online and in stores.", towns: "Srinagar · Jammu · Baramulla · Pulwama · Sopore · Pattan · Pampore", phone: "+91 7006158072" },
};
export const getHome = () => apiCached<HomeContent>("/content/home").catch(() => FALLBACK_HOME);
export const getAnnouncement = () => apiCached<Announcement | null>("/content/announcement").catch(() => ({ active: true, text: "Free delivery on orders above ₹1,999. Cash on delivery available.", href: "" }));
const FALLBACK_PAGES = [["about", "About JAFSON"], ["contact", "Contact us"], ["faq", "FAQs"], ["shipping", "Shipping policy"], ["returns", "Returns & exchange policy"], ["privacy", "Privacy policy"], ["terms", "Terms of use"]].map(([slug, title]) => ({ slug: slug!, title: title! }));
export const getPagesIndex = () => apiCached<{ slug: string; title: string }[]>("/content/pages").catch(() => FALLBACK_PAGES);
export const getPage = (slug: string) => apiCached<PageContent>(`/content/pages/${encodeURIComponent(slug)}`);
