import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { AdminLoyaltyController } from './admin-loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [AuthModule], // JwtService ให้ JwtAuthGuard (ฝั่งลูกค้า)
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService, JwtAuthGuard],
  exports: [LoyaltyService], // profile.service ใช้ทำการ์ดแต้ม (US-59)
})
export class LoyaltyModule {}
