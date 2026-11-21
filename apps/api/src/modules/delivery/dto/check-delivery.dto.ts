import {
  IsString,
  IsNotEmpty,
  IsLatitude,
  IsLongitude,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CheckDeliveryDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  /**
   * US-22: เช็คสำหรับออเดอร์ล่วงหน้า — ข้ามการเช็คเวลาทำการ (รอบส่งเป็นของพรุ่งนี้)
   * ไม่กระทบเรื่องเงิน: ค่าส่งยังคิดจากระยะทางฝั่ง server เหมือนเดิม
   */
  @IsOptional()
  @IsBoolean()
  scheduled?: boolean;
}
