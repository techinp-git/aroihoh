import { Controller, Get, Param } from '@nestjs/common';
import { PreorderService } from './preorder.service';

/**
 * US-22: รอบส่งพรุ่งนี้ + เวลาปิดรับ ให้ LIFF โชว์ตอนเช็คเอาต์
 * public ได้เหมือน /delivery/origin — เป็นเวลาทำการของร้าน ไม่ใช่ข้อมูลลูกค้า
 * และไม่คืนอะไรที่เกี่ยวกับเงิน (ค่าส่ง/ราคา คิดฝั่ง server เสมอ — กติกาเหล็ก #2)
 */
@Controller('delivery')
export class PreorderPublicController {
  constructor(private readonly preorder: PreorderService) {}

  @Get('slots/:brandId')
  slots(@Param('brandId') brandId: string) {
    return this.preorder.slotsForBrand(brandId);
  }
}
