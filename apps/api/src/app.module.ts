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
import { GstService } from "./gst/gst.service";
import { CatalogueAdminService } from "./admin/catalogue-admin.service";
import { CatalogueAdminController } from "./admin/catalogue-admin.controller";
import { ContentService } from "./content/content.service";
import { AdminContentController, ContentController } from "./content/content.controller";
import { MediaService } from "./media/media.service";
import { AdminMediaController, MediaController } from "./media/media.controller";
import { IntegrityService } from "./admin/integrity.service";
import { NotificationsService } from "./notifications/notifications.service";
import { ShippingService } from "./shipping/shipping.service";
import { CartService } from "./cart/cart.service";
import { CartController } from "./cart/cart.controller";
import { CouponsService } from "./checkout/coupons.service";
import { ThrottleService } from "./common/throttle.service";
import { HealthController } from "./health.controller";
import { UserGuard, AdminGuard, BillOsGuard, StaffTokenGuard } from "./common/guards";

@Module({
  controllers: [CatalogueAdminController, ContentController, AdminContentController, MediaController, AdminMediaController, CartController, CatalogueController, AuthController, OrdersController, PaymentsController, ReturnsController, IntegrationsController, AdminController, AdminAuthController, HealthController],
  providers: [PrismaService, ThrottleService, CatalogueAdminService, MediaService, ContentService, IntegrityService, NotificationsService, ShippingService, CartService, CouponsService, GstService, InventoryService, CatalogueService, AuthService, OrdersService, PaymentsService, ReturnsService, BillOsService, AdminService, StaffService, UserGuard, AdminGuard, BillOsGuard, StaffTokenGuard],
})
export class AppModule {}
