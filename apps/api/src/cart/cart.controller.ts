import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CartService } from "./cart.service";
import { UserGuard } from "../common/guards";
import { parse } from "../common/http";

const line = z.object({ sku: z.string().min(1).max(40), quantity: z.number().int().min(1).max(10) });

@Controller()
@UseGuards(UserGuard)
export class CartController {
  constructor(@Inject(CartService) private s: CartService) {}
  @Get("cart") get(@Req() r: any) { return this.s.get(r.userId); }
  @Put("cart/items") @HttpCode(200) set(@Req() r: any, @Body() b: unknown) { const x = parse(z.object({ sku: z.string().min(1).max(40), quantity: z.number().int().min(0).max(10) }), b); return this.s.setItem(r.userId, x.sku, x.quantity); }
  @Post("cart/merge") @HttpCode(200) merge(@Req() r: any, @Body() b: unknown) { return this.s.merge(r.userId, parse(z.object({ lines: z.array(line).max(30) }), b).lines); }
  @Delete("cart") clear(@Req() r: any) { return this.s.clear(r.userId); }
  @Get("wishlist") wishlist(@Req() r: any) { return this.s.wishlist(r.userId); }
  @Put("wishlist/:slug") @HttpCode(200) add(@Req() r: any, @Param("slug") slug: string) { return this.s.wish(r.userId, slug, true); }
  @Delete("wishlist/:slug") remove(@Req() r: any, @Param("slug") slug: string) { return this.s.wish(r.userId, slug, false); }
}
