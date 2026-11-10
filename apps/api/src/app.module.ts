import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma.service";
import { InventoryService } from "./inventory/inventory.service";
import { CatalogueService } from "./catalogue/catalogue.service";
import { CatalogueController } from "./catalogue/catalogue.controller";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { OrdersService } from "./orders/orders.service";
import { OrdersController } from "./orders/orders.controller";
import { ReturnsService } from "./returns/returns.service";
import { ReturnsController } from "./returns/returns.controller";
import { BillOsService } from "./integrations/billos.service";
import { IntegrationsController } from "./integrations/integrations.controller";
import { AdminController, AdminAuthController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { StaffService } from "./admin/staff.service";
import { PaymentsService } from "./payments/payments.service";
import { PaymentsController } from "./payments/payments.controller";
import { HealthController } from "./health.controller";
import { UserGuard, AdminGuard, BillOsGuard } from "./common/guards";

@Module({
  controllers: [CatalogueController, AuthController, OrdersController, PaymentsController, ReturnsController, IntegrationsController, AdminController, AdminAuthController, HealthController],
  providers: [PrismaService, InventoryService, CatalogueService, AuthService, OrdersService, PaymentsService, ReturnsService, BillOsService, AdminService, StaffService, UserGuard, AdminGuard, BillOsGuard],
})
export class AppModule {}
