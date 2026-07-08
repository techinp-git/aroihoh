import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
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

  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  @IsIn(['promptpay', 'cod'])
  paymentMethod: 'promptpay' | 'cod';

  // หมายเหตุถึงร้าน ระดับออเดอร์ (US-02)
  @IsOptional() @IsString() note?: string;
}
