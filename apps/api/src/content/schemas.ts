import { z } from "zod";

/** Links point inside the site ("/collections/men") or to a secure address. Protocol-relative ("//host") and script links are refused. */
export const link = z.string().trim().max(500).refine((u) => (u.startsWith("/") && !u.startsWith("//")) || /^https:\/\/[^\s]+$/.test(u), "Links start with / (inside the site) or https://");
const text = (max: number) => z.string().trim().max(max);
const uuid = z.string().uuid();
const when = z.string().datetime().nullable().optional();

export const slide = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/), theme: z.enum(["men", "kids", "neutral"]).default("neutral"),
  eyebrow: text(40).default(""), headline: text(90).min(1, "Every banner needs a headline"), text: text(220).default(""),
  ctaLabel: text(30).default(""), ctaHref: link.or(z.literal("")).default(""),
  mediaId: uuid.nullable().optional(), active: z.boolean().default(true), startsAt: when, endsAt: when,
}).refine((s) => !s.ctaLabel || !!s.ctaHref, { message: "A button needs a link", path: ["ctaHref"] }).refine((s) => !s.startsAt || !s.endsAt || new Date(s.endsAt) > new Date(s.startsAt), { message: "The end must be after the start", path: ["endsAt"] });

export const homeSchema = z.object({
  hero: z.object({ slides: z.array(slide).min(1, "Keep at least one banner").max(6) }),
  categories: z.object({ active: z.boolean().default(true), eyebrow: text(40).default(""), title: text(60).default(""), items: z.array(z.object({ title: text(40).min(1), collection: z.enum(["men", "kids"]), category: text(40).min(1), mediaId: uuid.nullable().optional() })).max(8) }),
  newArrivals: z.object({ active: z.boolean().default(true), eyebrow: text(40).default(""), title: text(60).default("") }),
  bestsellers: z.object({ active: z.boolean().default(true), eyebrow: text(40).default(""), title: text(60).default("") }),
  stores: z.object({ active: z.boolean().default(true), eyebrow: text(40).default(""), title: text(100).default(""), text: text(300).default(""), towns: text(200).default(""), phone: text(30).default("") }),
});
export const announcementSchema = z.object({ active: z.boolean(), text: text(160), href: link.or(z.literal("")).default("") });
export const pageSchema = z.object({ title: text(80).min(2), intro: text(240).default(""), sections: z.array(z.object({ heading: text(120).min(1), body: text(4000).min(1) })).min(1).max(24) });
export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).min(2).max(40);
export const pagesSchema = z.record(slugSchema, pageSchema).refine((p) => Object.keys(p).length <= 30, "At most 30 pages");

export const KEYS = { home: homeSchema, announcement: announcementSchema, pages: pagesSchema } as const;
export type ContentKey = keyof typeof KEYS;
export type Home = z.infer<typeof homeSchema>; export type Slide = z.infer<typeof slide>; export type Page = z.infer<typeof pageSchema>;
