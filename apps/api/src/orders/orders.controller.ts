import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { OrdersService, orderSchema, quoteSchema } from "./orders.service";
import { UserGuard } from "../common/guards";
import { GstService } from "../gst/gst.service";
import { AppError, parse } from "../common/http";

const phoneQ = z.string().regex(/^[6-9]\d{9}$/).optional();

@Controller()
export class OrdersController {
  constructor(@Inject(OrdersService) private s: OrdersService, @Inject(GstService) private gst: GstService) {}
  @Get("checkout/serviceability") serviceability(@Query("pincode") p = "") { return this.s.serviceability(p); }
  @Post("checkout/quote") @HttpCode(200) quote(@Body() b: unknown) { return this.s.quote(parse(quoteSchema, b)); }
  @Post("checkout/orders") create(@Req() r: any, @Body() b: unknown) { return this.s.create(r.userId ?? null, parse(orderSchema, b)); }
  @Get("orders") @UseGuards(UserGuard) list(@Req() r: any) { return this.s.list(r.userId); }
  @Get("orders/:number") one(@Req() r: any, @Param("number") n: string, @Query("phone") phone?: string) { return this.s.get(n, { userId: r.userId, phone: parse(phoneQ, phone) }); }
  @Get("orders/:number/documents") async docs(@Req() r: any, @Param("number") n: string, @Query("phone") phone?: string) { const o = await this.s.find(n, { userId: r.userId, phone: parse(phoneQ, phone) }); return this.gst.documentsFor(o.id); }
  @Post("orders/:number/cancel") @HttpCode(200) cancel(@Req() r: any, @Param("number") n: string, @Body() b: any) { return this.s.cancel(n, { userId: r.userId, phone: parse(phoneQ, b?.phone) }); }
  @Post("webhooks/payments/mock") @HttpCode(200) hook(@Req() r: any, @Headers("x-signature") sig: string) {
    if (!r.rawBody) throw new AppError("BAD_REQUEST", "Missing body", 400);
    return this.s.webhook(r.rawBody.toString("utf8"), sig);
  }
}
