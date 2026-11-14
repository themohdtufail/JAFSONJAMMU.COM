import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ReturnsService, returnSchema } from "./returns.service";
import { UserGuard } from "../common/guards";
import { parse } from "../common/http";
import { clientIp } from "../common/security";
@Controller()
export class ReturnsController {
  constructor(@Inject(ReturnsService) private s: ReturnsService) {}
  @Post("returns") create(@Req() r: any, @Body() b: unknown) { return this.s.create(r.userId ?? null, parse(returnSchema, b), clientIp(r)); }
  @Get("returns") @UseGuards(UserGuard) list(@Req() r: any) { return this.s.list(r.userId); }
}
