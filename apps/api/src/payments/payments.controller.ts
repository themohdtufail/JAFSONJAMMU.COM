import { Body, Controller, Headers, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { PaymentsService, verifySchema } from "./payments.service";
import { AppError, parse } from "../common/http";
import { clientIp } from "../common/security";

const phone = z.string().regex(/^[6-9]\d{9}$/).optional();

@Controller()
export class PaymentsController {
  constructor(@Inject(PaymentsService) private s: PaymentsService) {}
  @Post("payments/session") @HttpCode(200) session(@Req() r: any, @Body() b: unknown) { const x = parse(z.object({ orderNumber: z.string(), phone }), b); return this.s.session(x.orderNumber, { userId: r.userId, phone: x.phone, ip: clientIp(r) }); }
  @Post("payments/verify") @HttpCode(200) verify(@Req() r: any, @Body() b: unknown) { const x = parse(verifySchema, b); return this.s.verifyCheckout(x, { userId: r.userId, phone: x.phone, ip: clientIp(r) }); }
  @Post("payments/mock/:ref/pay") @HttpCode(200) mock(@Param("ref") ref: string, @Body() b: any) { return this.s.mockPay(ref, b?.outcome === "fail" ? "fail" : "success"); }
  @Post("webhooks/payments/razorpay") @HttpCode(200) razorpay(@Req() r: any, @Headers("x-razorpay-signature") sig: string, @Headers("x-razorpay-event-id") eid?: string) {
    if (!r.rawBody) throw new AppError("BAD_REQUEST", "Missing body", 400);
    return this.s.razorpayWebhook(r.rawBody.toString("utf8"), sig, eid);
  }
}
