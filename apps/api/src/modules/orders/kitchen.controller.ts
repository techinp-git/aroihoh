import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

// US-37: จอครัว (KDS) — คิวออเดอร์รวมทุกแบรนด์ที่ admin คนนี้มีสิทธิ์ (ไม่รับ brandId เดี่ยว)
// US-45: kitchen role เข้าได้ (+ role ทั่วไป) — chat_agent เข้าไม่ได้
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff', 'kitchen')
@Controller('admin/kitchen')
export class KitchenController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  orders_(@CurrentAdmin() admin: AdminJwt) {
    return this.orders.listForKitchen(admin.brandIds);
  }
}
