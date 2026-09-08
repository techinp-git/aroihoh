import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderStreamController } from './order-stream.controller';
import { KitchenController } from './kitchen.controller';
import { OrdersService } from './orders.service';
import { OrderEventsService } from './order-events.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  // DeliveryService (quote) + JwtModule (guard) + NotificationsService (US-08/09 แจ้งลูกค้า)
  // + LoyaltyModule: ให้แต้มตอนส่งสำเร็จ (US-56) + ใช้แต้มเป็นส่วนลด (US-57)
  imports: [DeliveryModule, AuthModule, NotificationsModule, LoyaltyModule],
  controllers: [OrdersController, AdminOrdersController, OrderStreamController, KitchenController],
  providers: [OrdersService, OrderEventsService, JwtAuthGuard],
})
export class OrdersModule {}
