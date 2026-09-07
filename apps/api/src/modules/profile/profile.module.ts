import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { DeliveryModule } from '../delivery/delivery.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  // DeliveryService (ป้าย "ส่งถึงไหม" ในสมุดที่อยู่) + AuthModule ให้ JwtService กับ JwtAuthGuard
  imports: [DeliveryModule, AuthModule],
  controllers: [ProfileController],
  providers: [ProfileService, JwtAuthGuard],
})
export class ProfileModule {}
