import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  // DeliveryService (ป้าย "ส่งถึงไหม" ในสมุดที่อยู่) + AuthModule ให้ JwtService กับ JwtAuthGuard
  // + LoyaltyModule: การ์ดแต้มในหน้าโปรไฟล์ (US-50/59)
  imports: [DeliveryModule, AuthModule, LoyaltyModule],
  controllers: [ProfileController],
  providers: [ProfileService, JwtAuthGuard],
})
export class ProfileModule {}
