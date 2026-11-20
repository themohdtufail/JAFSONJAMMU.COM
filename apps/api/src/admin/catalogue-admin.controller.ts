import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CatalogueAdminService, detailsSchema, mediaItems } from "./catalogue-admin.service";
import { AdminGuard, MinRole } from "../common/guards";
import { parse } from "../common/http";

const who = (r: any) => `${r.actor.name}#${r.actor.id}`;
/** Everything a manager needs to run the catalogue from the back-office. */
@Controller("admin")
@UseGuards(AdminGuard)
@MinRole("MANAGER")
export class CatalogueAdminController {
  constructor(@Inject(CatalogueAdminService) private s: CatalogueAdminService) {}
  @Get("products/:slug") get(@Param("slug") slug: string) { return this.s.get(slug); }
  @Put("products/:slug/details") @HttpCode(200) details(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) { return this.s.update(slug, parse(detailsSchema, b), who(r)); }
  @Put("products/:slug/status") @HttpCode(200) status(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) { return this.s.setStatus(slug, parse(z.object({ status: z.enum(["ACTIVE", "DRAFT"]) }), b).status, who(r)); }
  @Put("products/:slug/media") @HttpCode(200) media(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) { return this.s.setMedia(slug, parse(z.object({ items: mediaItems }), b).items, who(r)); }
  @Post("products/:slug/variants") @HttpCode(200) addVariants(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) {
    return this.s.addVariants(slug, parse(z.object({ colour: z.object({ name: z.string().trim().min(2).max(30), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }), sizes: z.array(z.string().trim().min(1).max(10)).min(1).max(12), initialStock: z.number().int().min(0).max(1000).default(0) }), b), who(r)); }
  @Patch("variants/:sku") patchVariant(@Req() r: any, @Param("sku") sku: string, @Body() b: unknown) { return this.s.patchVariant(sku, parse(z.object({ isActive: z.boolean().optional(), barcode: z.string().trim().max(40).nullable().optional(), colourHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }), b), who(r)); }
  @Get("categories") categories() { return this.s.categories(); }
  @Post("categories") @HttpCode(200) createCategory(@Req() r: any, @Body() b: unknown) { return this.s.createCategory(parse(z.object({ name: z.string().trim().min(2).max(40), collection: z.enum(["men", "kids"]), mediaId: z.string().uuid().optional() }), b), who(r)); }
  @Patch("categories/:slug") updateCategory(@Req() r: any, @Param("slug") slug: string, @Body() b: unknown) { return this.s.updateCategory(slug, parse(z.object({ name: z.string().trim().min(2).max(40).optional(), sortOrder: z.number().int().min(0).max(999).optional(), isActive: z.boolean().optional(), mediaId: z.string().uuid().nullable().optional() }), b), who(r)); }
  @Delete("categories/:slug") deleteCategory(@Req() r: any, @Param("slug") slug: string) { return this.s.deleteCategory(slug, who(r)); }
}
