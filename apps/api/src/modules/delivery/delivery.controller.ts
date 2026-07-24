import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CheckDeliveryDto } from './dto/check-delivery.dto';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  // US-03: จุดตั้งครัว + รัศมี ให้ LIFF ตั้งกึ่งกลางแผนที่ + วาดวงเขตส่ง
  @Get('origin/:brandId')
  origin(@Param('brandId') brandId: string) {
    return this.delivery.origin(brandId);
  }

  // US-03: LIFF เรียกเช็คเขตก่อนยืนยัน (server re-check อีกครั้งตอนสร้างออเดอร์ — US-04)
  @Post('check')
  check(@Body() dto: CheckDeliveryDto) {
    return this.delivery.check(dto.brandId, { lat: dto.lat, lng: dto.lng });
  }
}
