import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { BatchStatusDto, CreateBatchDto, CreateRewardDto, UpdateRewardDto } from './dto/loyalty.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

/**
 * US-50 ฝั่งแอดมิน (แกน) — ล็อต QR + รางวัล + ยืนยันแลกแต้ม
 * UI เต็ม (แผ่นพิมพ์/CSV/หน้าสแกน/รายงาน) อยู่ใน US-51/53/54/55
 *
 * ยืนยันแลกแต้มให้ระดับ staff ขึ้นไป — คนขายหน้าร้านต้องกดได้เอง ไม่ต้องตาม manager
 */
@UseGuards(AdminJwtGuard, RolesGuard)
@Controller('admin/loyalty')
export class AdminLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Post('batches')
  @Roles('owner', 'manager')
  createBatch(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateBatchDto) {
    return this.loyalty.createBatch(admin, dto);
  }

  @Get('batches')
  @Roles('owner', 'manager')
  listBatches(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    return this.loyalty.listBatches(admin, brandId);
  }

  @Patch('batches/:id')
  @Roles('owner', 'manager')
  setStatus(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: BatchStatusDto,
  ) {
    return this.loyalty.setBatchStatus(admin, brandId, id, dto.status);
  }

  @Get('batches/:id/codes')
  @Roles('owner', 'manager')
  codes(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    return this.loyalty.listCodes(admin, brandId, id);
  }

  @Post('rewards')
  @Roles('owner', 'manager')
  createReward(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateRewardDto) {
    return this.loyalty.createReward(admin, dto);
  }

  @Patch('rewards/:id')
  @Roles('owner', 'manager')
  updateReward(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRewardDto,
  ) {
    return this.loyalty.updateReward(admin, brandId, id, dto);
  }

  @Get('rewards')
  @Roles('owner', 'manager')
  listRewards(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    return this.loyalty.listAdminRewards(admin, brandId);
  }

  // คนขายสแกนคูปอง — brandId มาจากตัวคูปอง ไม่รับจาก client (กันข้ามแบรนด์)
  @Get('redemptions/:token')
  @Roles('owner', 'manager', 'staff')
  preview(@CurrentAdmin() admin: AdminJwt, @Param('token') token: string) {
    return this.loyalty.previewRedemption(admin, token);
  }

  @Post('redemptions/:token/confirm')
  @Roles('owner', 'manager', 'staff')
  confirm(@CurrentAdmin() admin: AdminJwt, @Param('token') token: string) {
    return this.loyalty.confirmRedemption(admin, token);
  }
}
