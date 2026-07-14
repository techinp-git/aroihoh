import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule], // ใช้ AdminAuthService.issueTokenFor (refresh token หลังสร้างแบรนด์)
  controllers: [BrandsController],
})
export class BrandsModule {}
