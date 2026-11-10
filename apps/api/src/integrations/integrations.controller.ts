import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { BillOsService } from "./billos.service";
import { BillOsGuard } from "../common/guards";
import { parse } from "../common/http";

@Controller("integrations/bill-os")
@UseGuards(BillOsGuard)
export class IntegrationsController {
  constructor(@Inject(BillOsService) private s: BillOsService) {}
  @Post("events") @HttpCode(200) async events(@Body() b: unknown) {
    const list = parse(z.object({ events: z.array(z.unknown()).min(1).max(100) }), b).events;
    const results = []; for (const e of list) results.push(await this.s.process(e)); // sequential keeps per-SKU ordering
    return { results };
  }
  @Post("snapshots") @HttpCode(200) snapshot(@Body() b: unknown) { const x = parse(z.object({ location_id: z.string(), lines: z.array(z.object({ sku: z.string(), quantity: z.number().int().min(0) })).max(5000) }), b); return this.s.snapshot(x.location_id, x.lines); }
  @Get("events/status") status() { return this.s.status(); }
}
