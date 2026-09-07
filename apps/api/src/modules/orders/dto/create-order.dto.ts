import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsString() @IsNotEmpty() menuItemId: string;
  @IsInt() @Min(1) qty: number;
  @IsOptional() @IsString() note?: string;
}

export class DeliveryAddressDto {
  @IsOptional() @IsString() label?: string;
  @IsString() @IsNotEmpty() detail: string;
  // US-58: ชั้น/ห้อง/จุดสังเกต — ไหลไป snapshot และใบไรเดอร์ (US-43)
  @IsOptional() @IsString() note?: string;
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

export class CreateOrderDto {
  // client สร้าง UUID ต่อ 1 ครั้งของการกดยืนยัน — US-04 กันสร้างซ้ำ
  @IsString() @IsNotEmpty() idempotencyKey: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  /**
   * US-58: ปลายทางมาได้ 2 ทาง ต้องส่งมาอย่างใดอย่างหนึ่ง (service เช็คซ้ำ)
   *  - savedAddressId = หมุดในสมุดที่อยู่ของลูกค้าคนนี้
   *  - deliveryAddress = ปักหมุดสด (พฤติกรรมเดิม)
   * ไม่ว่าทางไหน server ก็ copy เป็น snapshot ของออเดอร์ + เช็คเขตซ้ำเสมอ (กติกาเหล็ก #5)
   */
  @IsOptional() @IsString() @IsNotEmpty() savedAddressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  /** ติ๊ก "บันทึกที่อยู่นี้ไว้" ตอนเช็คเอาต์ — ใช้ได้กับ deliveryAddress เท่านั้น */
  @IsOptional() @IsBoolean() saveAddress?: boolean;

  @IsIn(['promptpay', 'cod'])
  paymentMethod: 'promptpay' | 'cod';

  // หมายเหตุถึงร้าน ระดับออเดอร์ (US-02)
  @IsOptional() @IsString() note?: string;
}
