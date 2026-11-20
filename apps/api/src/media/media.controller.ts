import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { MediaService } from "./media.service";
import { AdminGuard, MinRole } from "../common/guards";
import { AppError, parse } from "../common/http";

/** Public: one stored picture size. */
@Controller("media")
export class MediaController {
  constructor(@Inject(MediaService) private s: MediaService) {}
  @Get(":id/:file") async serve(@Param("id") id: string, @Param("file") file: string, @Req() req: any, @Res() res: any) {
    const m = /^(\d{2,4})\.webp$/.exec(file);
    if (!/^[0-9a-f-]{36}$/.test(id) || !m) throw new AppError("NOT_FOUND", "Not found", 404);
    const etag = `"${id}-${m[1]}"`; res.setHeader("ETag", etag); res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    const data = await this.s.blob(id, Number(m[1])); if (!data) { res.removeHeader("Cache-Control"); res.removeHeader("ETag"); throw new AppError("NOT_FOUND", "Not found", 404); }
    res.setHeader("Content-Type", "image/webp"); res.setHeader("Content-Length", String(data.length)); res.status(200).end(data);
  }
}

const altSchema = z.string().trim().max(200).default("");
/** Back-office media library. Managers and owners only. */
@Controller("admin/media")
@UseGuards(AdminGuard)
@MinRole("MANAGER")
export class AdminMediaController {
  constructor(@Inject(MediaService) private s: MediaService) {}
  @Get("config") config() { return this.s.config(); }
  @Get() list(@Query() q: any) { const x = parse(z.object({ kind: z.enum(["IMAGE", "VIDEO"]).optional(), q: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(100).default(40), offset: z.coerce.number().int().min(0).default(0) }), q); return this.s.list(x); }
  @Post("upload") @HttpCode(200) upload(@Req() r: any, @Query("alt") alt?: string) {
    if (!Buffer.isBuffer(r.body) || !r.body.length) throw new AppError("NO_FILE", "Send the picture as the request body with an image content type (JPG, PNG, WebP or AVIF).", 415);
    return this.s.uploadImage(r.body, parse(altSchema, alt ?? ""), `${r.actor.name}#${r.actor.id}`);
  }
  @Post("external") @HttpCode(200) external(@Req() r: any, @Body() b: unknown) { const x = parse(z.object({ url: z.string().trim().max(500), alt: altSchema, posterId: z.string().uuid().optional() }), b); return this.s.registerExternalVideo(x.url, x.alt, x.posterId, `${r.actor.name}#${r.actor.id}`); }
  @Post("presign") @HttpCode(200) presign(@Body() b: unknown) { const x = parse(z.object({ mime: z.string().max(40), bytes: z.number().int() }), b); return this.s.presignVideo(x.mime, x.bytes); }
  @Post("complete") @HttpCode(200) complete(@Req() r: any, @Body() b: unknown) { const x = parse(z.object({ key: z.string().max(200), alt: altSchema, posterId: z.string().uuid().optional() }), b); return this.s.completeVideo(x.key, x.alt, x.posterId, `${r.actor.name}#${r.actor.id}`); }
  @Patch(":id") update(@Param("id") id: string, @Body() b: unknown) { return this.s.setAlt(id, parse(z.object({ alt: altSchema }), b).alt); }
  @Delete(":id") remove(@Param("id") id: string) { return this.s.remove(id); }
}
