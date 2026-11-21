import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PreorderService } from './preorder.service';
import { CreateSlotDto, SetCutoffDto, UpdateSlotDto } from './dto/preorder.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

/**
 * US-22: ตั้งค่าสั่งล่วงหน้า (เวลาปิดรับ + รอบส่ง) — owner/manager
 * ค่าเหล่านี้กระทบกำลังผลิตและรอบรถ จึงไม่เปิดให้ staff/kitchen แก้
 */
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/preorder')
export class PreorderController {
  constructor(private readonly preorder: PreorderService) {}

  @Get('settings')
  settings(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.preorder.getSettings(brandId);
  }

  @Patch('settings')
  setCutoff(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Body() dto: SetCutoffDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.preorder.setCutoff(brandId, dto.cutoffTime);
  }

  @Post('slots')
  createSlot(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Body() dto: CreateSlotDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.preorder.createSlot(brandId, dto);
  }

  @Patch('slots/:id')
  updateSlot(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSlotDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.preorder.updateSlot(brandId, id, dto);
  }

  @Delete('slots/:id')
  removeSlot(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.preorder.removeSlot(brandId, id);
  }
}

/**
 * US-22: ใบสรุปยอดผลิตให้ครัว — คนละ controller เพราะคนละขอบเขตสิทธิ์
 * ไม่รับ brandId: รวมทุกแบรนด์ที่แอดมินคนนี้มีสิทธิ์ (ครัวเดียวทำหลายแบรนด์ — เหมือน KDS US-37)
 * kitchen role ต้องเข้าได้ นี่คือใบที่ครัวใช้ทำงาน
 */
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff', 'kitchen')
@Controller('admin/preorder')
export class PreorderSummaryController {
  constructor(private readonly preorder: PreorderService) {}

  @Get('summary')
  summary(
    @CurrentAdmin() admin: AdminJwt,
    @Query('date') date?: string,
    @Query('slotId') slotId?: string,
  ) {
    return this.preorder.productionSummary(admin.brandIds, { date, slotId });
  }
}
