import { Body, Controller, Post } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CheckDeliveryDto } from './dto/check-delivery.dto';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  // US-03: LIFF เรียกเช็คเขตก่อนยืนยัน (server re-check อีกครั้งตอนสร้างออเดอร์ — US-04)
  @Post('check')
  check(@Body() dto: CheckDeliveryDto) {
    return this.delivery.check(dto.brandId, { lat: dto.lat, lng: dto.lng });
  }
}
