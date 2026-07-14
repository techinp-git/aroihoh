import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderStreamController } from './order-stream.controller';
import { KitchenController } from './kitchen.controller';
import { OrdersService } from './orders.service';
import { OrderEventsService } from './order-events.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [DeliveryModule, AuthModule], // DeliveryService (quote) + JwtModule (guard)
  controllers: [OrdersController, AdminOrdersController, OrderStreamController, KitchenController],
  providers: [OrdersService, OrderEventsService, JwtAuthGuard],
})
export class OrdersModule {}
