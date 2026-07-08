import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [DeliveryModule, AuthModule], // DeliveryService (quote) + JwtModule (guard)
  controllers: [OrdersController],
  providers: [OrdersService, JwtAuthGuard],
})
export class OrdersModule {}
