import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ContentService } from "./content.service";
import { AdminGuard, MinRole } from "../common/guards";
import { parse } from "../common/http";

const cache = (res: any) => res.setHeader("Cache-Control", "public, max-age=15, s-maxage=60, stale-while-revalidate=600"); // fresh edits show within about a minute; a sleeping API never blocks a page

@Controller("content")
export class ContentController {
  constructor(@Inject(ContentService) private s: ContentService) {}
  @Get("home") home(@Res({ passthrough: true }) res: any) { cache(res); return this.s.publicHome(); }
  @Get("announcement") announcement(@Res({ passthrough: true }) res: any) { cache(res); return this.s.publicAnnouncement(); }
  @Get("pages") pages(@Res({ passthrough: true }) res: any) { cache(res); return this.s.pagesIndex(); }
  @Get("pages/:slug") page(@Param("slug") slug: string, @Res({ passthrough: true }) res: any) { cache(res); return this.s.page(slug); }
}

@Controller("admin/content")
@UseGuards(AdminGuard)
@MinRole("MANAGER")
export class AdminContentController {
  constructor(@Inject(ContentService) private s: ContentService) {}
  @Get(":key") get(@Param("key") key: string) { return this.s.admin(key); }
  @Put(":key") @HttpCode(200) save(@Req() r: any, @Param("key") key: string, @Body() b: unknown) { const x = parse(z.object({ data: z.unknown(), expectedVersion: z.number().int().min(0) }), b); return this.s.save(key, x.data, x.expectedVersion, `${r.actor.name}#${r.actor.id}`); }
  @Get(":key/revisions") revisions(@Param("key") key: string) { return this.s.revisions(key); }
  @Post(":key/revert") @HttpCode(200) revert(@Req() r: any, @Param("key") key: string, @Query("version") v: string) { return this.s.revert(key, parse(z.coerce.number().int().min(1), v), `${r.actor.name}#${r.actor.id}`); }
}
