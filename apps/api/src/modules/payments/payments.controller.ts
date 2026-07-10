import { Controller, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

@UseGuards(AdminJwtGuard)
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
