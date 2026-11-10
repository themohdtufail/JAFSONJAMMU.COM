import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { CatalogueService } from "./catalogue.service";
import { parse } from "../common/http";

const listQ = z.object({ brand: z.string().max(60).optional(), collection: z.enum(["men", "kids"]).optional(), category: z.string().max(60).optional(), filter: z.enum(["new", "best", "sale"]).optional(), sort: z.enum(["featured", "new", "low", "high"]).optional(), q: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });

@Controller()
export class CatalogueController {
  constructor(@Inject(CatalogueService) private s: CatalogueService) {}
  @Get("products") list(@Query() q: unknown) { return this.s.list(parse(listQ, q)); }
  @Get("products/:slug") one(@Param("slug") slug: string) { return this.s.bySlug(slug); }
  @Get("brands") brands() { return this.s.brands(); }
  @Get("categories") cats() { return this.s.categories(); }
  @Get("collections") cols() { return [{ slug: "men", name: "Men" }, { slug: "kids", name: "Kids" }]; }
  @Get("search") search(@Query("q") q = "") { return this.s.list({ q: q.slice(0, 80), limit: 12 }); }
  @Get("size-guides") guides() { return this.s.sizeGuides(); }
}
