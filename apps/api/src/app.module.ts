import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { OrdersModule } from './modules/orders/orders.module';
import { BrandsModule } from './modules/brands/brands.module';
import { KitchensModule } from './modules/kitchens/kitchens.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ChatModule } from './modules/chat/chat.module';
import { StoreModule } from './modules/store/store.module';
import { BroadcastsModule } from './modules/broadcasts/broadcasts.module';
import { ContentModule } from './modules/content/content.module';
import { AudiencesModule } from './modules/audiences/audiences.module';
import { LineModule } from './modules/line/line.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MediaModule } from './modules/media/media.module';
import { ProfileModule } from './modules/profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    MenuModule,
    DeliveryModule,
    OrdersModule,
    BrandsModule,
    KitchensModule,
    AdminAuthModule,
    AdminUsersModule,
    ReportsModule,
    PaymentsModule,
    CustomersModule,
    ProfileModule,
    ChatModule,
    StoreModule,
    BroadcastsModule,
    ContentModule,
    AudiencesModule,
    MediaModule,
    LineModule,
    NotificationsModule,
  ],
})
export class AppModule {}
