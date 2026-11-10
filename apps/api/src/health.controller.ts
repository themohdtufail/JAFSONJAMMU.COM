import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "./common/prisma.service";
@Controller()
export class HealthController {
  constructor(@Inject(PrismaService) private p: PrismaService) {}
  @Get("health") async health() { await this.p.$queryRaw`SELECT 1`; return { status: "ok" }; }
}
