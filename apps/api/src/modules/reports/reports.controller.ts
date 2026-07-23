import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

// US-45: ยอดขาย/รายงาน — kitchen/chat_agent เข้าไม่ได้
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // GET /api/admin/reports/daily?brandId=&date=YYYY-MM-DD (date optional = วันนี้)
  @Get('daily')
  daily(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Query('date') date?: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.reports.dailySummary(brandId, date);
  }

  // US-38: สรุปรวมทุกแบรนด์ที่ admin มีสิทธิ์ (ไม่รับ brandId) — dashboard ระดับ merchant
  @Get('merchant-daily')
  merchantDaily(@CurrentAdmin() admin: AdminJwt, @Query('date') date?: string) {
    return this.reports.merchantDaily(admin.brandIds, date);
  }

  // US-19: มาร์จิ้น/กล่อง + จุดคุ้มทุนรายวัน
  @Get('margin')
  margin(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Query('date') date?: string) {
    assertBrandAccess(admin, brandId);
    return this.reports.marginDaily(brandId, date);
  }

  // US-19: ตั้งค่าใช้จ่ายคงที่ต่อวัน (สตางค์) — owner เท่านั้น เพราะกระทบตัวเลขตัดสินใจธุรกิจ
  @Patch('fixed-cost')
  @Roles('owner')
  setFixedCost(
    @CurrentAdmin() admin: AdminJwt,
    @Body() body: { brandId: string; fixedCostDaily: number | null },
  ) {
    assertBrandAccess(admin, body.brandId);
    const v = body.fixedCostDaily;
    return this.reports.setFixedCost(body.brandId, v === null || v === undefined ? null : Math.max(0, Math.round(v)));
  }
}
