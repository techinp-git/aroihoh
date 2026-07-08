import { IsIn, IsOptional, IsString } from 'class-validator';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';

const ALL_STATUSES = [...ORDER_STATUS_FLOW, 'cancelled'] as const;

export class UpdateOrderStatusDto {
  @IsIn(ALL_STATUSES as unknown as string[])
  status: (typeof ALL_STATUSES)[number];

  // จำเป็นเมื่อ status = cancelled (ตรวจซ้ำใน service)
  @IsOptional() @IsString() reason?: string;
}
