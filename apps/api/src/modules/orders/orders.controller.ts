import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import type { CustomerJwt } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // US-02/US-04: ลูกค้ายืนยันออเดอร์ (brandId มาจาก JWT ไม่ใช่จาก body)
  @Post()
  create(@CurrentCustomer() customer: CustomerJwt, @Body() dto: CreateOrderDto) {
    return this.orders.create({ sub: customer.sub, brandId: customer.brandId }, dto);
  }

  // US-05: ติดตามสถานะออเดอร์ของตัวเอง
  @Get(':id')
  async get(@CurrentCustomer() customer: CustomerJwt, @Param('id') id: string) {
    const order = await this.orders.getForCustomer(customer.sub, id);
    if (!order) throw new NotFoundException('order not found');
    return order;
  }
}
