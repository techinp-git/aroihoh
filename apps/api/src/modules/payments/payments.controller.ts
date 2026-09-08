import { Controller, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

// US-45: "เก็บเงินแล้ว" เป็นงานของหน้าร้าน ไม่ใช่ครัว/แอดมินแชต
// (path นี้อยู่ใต้ /admin/orders เหมือน AdminOrdersController ที่เปิดให้ kitchen ไล่สถานะได้
//  แต่การรับเงินคนละเรื่องกับการทำอาหาร — role list ตรงกับหน้า "ออเดอร์" ใน admin)
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff')
@Controller('admin/orders')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // US-07: PATCH /api/admin/orders/:id/mark-paid — เก็บเงินปลายทางแล้ว
  @Patch(':id/mark-paid')
  markPaid(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.payments.markCodPaid(brandId, id, admin.sub);
  }
}
