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
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { UpdateOrderStatusDto } from './dto/update-status.dto';

// ⚠️ AdminKeyGuard ชั่วคราว (x-admin-key) — actorId จริงจะมาเมื่อทำ admin auth
@UseGuards(AdminKeyGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  // EP-04: รายการออเดอร์ของแบรนด์ (filter status ได้)
  @Get()
  list(@Query('brandId') brandId: string, @Query('status') status?: OrderStatus) {
    return this.orders.listForBrand(brandId, status);
  }

  // US-12: เปลี่ยนสถานะไล่ลำดับ / ยกเลิก (ต้องมีเหตุผล)
  @Patch(':id/status')
  updateStatus(
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(
      brandId,
      id,
      dto.status,
      { type: 'admin' },
      dto.reason,
    );
  }
}
