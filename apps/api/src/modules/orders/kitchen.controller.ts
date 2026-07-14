import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

// US-37: จอครัว (KDS) — คิวออเดอร์รวมทุกแบรนด์ที่ admin คนนี้มีสิทธิ์ (ไม่รับ brandId เดี่ยว)
@UseGuards(AdminJwtGuard)
@Controller('admin/kitchen')
export class KitchenController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  orders_(@CurrentAdmin() admin: AdminJwt) {
    return this.orders.listForKitchen(admin.brandIds);
  }
}
