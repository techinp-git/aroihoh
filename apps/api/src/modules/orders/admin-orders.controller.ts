import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { OrderStatus } from '@aroihoh/shared';
import { OrdersService } from './orders.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';
import { UpdateOrderStatusDto } from './dto/update-status.dto';

// US-45: kitchen เข้าได้ (ดู+ไล่สถานะออเดอร์) — chat_agent เข้าไม่ได้
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff', 'kitchen')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  // EP-04: รายการออเดอร์ของแบรนด์ (filter status ได้)
  @Get()
  list(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Query('status') status?: OrderStatus,
  ) {
    assertBrandAccess(admin, brandId);
    return this.orders.listForBrand(brandId, status);
  }

  // US-12: เปลี่ยนสถานะไล่ลำดับ / ยกเลิก — actorId จริงจาก admin JWT (ลง audit log)
  @Patch(':id/status')
  updateStatus(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.orders.updateStatus(
      brandId,
      id,
      dto.status,
      { type: 'admin', id: admin.sub },
      dto.reason,
    );
  }
}
