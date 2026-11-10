import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { UserGuard } from "../common/guards";
import { parse } from "../common/http";

const phone = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
const addr = z.object({ fullName: z.string().min(2).max(80), phone, line1: z.string().min(3).max(160), line2: z.string().max(160).optional(), city: z.string().min(2).max(60), state: z.string().min(2).max(60), postalCode: z.string().regex(/^\d{6}$/), isDefault: z.boolean().optional() });

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private s: AuthService) {}
  @Post("auth/otp/request") @HttpCode(200) otpReq(@Body() b: unknown) { return this.s.requestOtp(parse(z.object({ phone }), b).phone); }
  @Post("auth/otp/verify") @HttpCode(200) otpVerify(@Body() b: unknown) { const x = parse(z.object({ phone, code: z.string().regex(/^\d{6}$/) }), b); return this.s.verifyOtp(x.phone, x.code); }
  @Post("auth/refresh") @HttpCode(200) refresh(@Body() b: unknown) { return this.s.refresh(parse(z.object({ refreshToken: z.string().min(10) }), b).refreshToken); }
  @Post("auth/logout") @HttpCode(200) logout(@Body() b: any) { return this.s.logout(b?.refreshToken); }
  @Get("auth/me") @UseGuards(UserGuard) me(@Req() r: any) { return this.s.me(r.userId); }
  @Patch("auth/me") @UseGuards(UserGuard) upd(@Req() r: any, @Body() b: unknown) { return this.s.updateMe(r.userId, parse(z.object({ name: z.string().min(1).max(80).optional(), email: z.string().email().optional() }), b)); }
  @Delete("auth/account") @UseGuards(UserGuard) del(@Req() r: any) { return this.s.requestDeletion(r.userId); }
  @Get("addresses") @UseGuards(UserGuard) list(@Req() r: any) { return this.s.addresses(r.userId); }
  @Post("addresses") @UseGuards(UserGuard) add(@Req() r: any, @Body() b: unknown) { return this.s.addAddress(r.userId, parse(addr, b)); }
  @Delete("addresses/:id") @UseGuards(UserGuard) rm(@Req() r: any, @Param("id") id: string) { return this.s.deleteAddress(r.userId, id); }
}
