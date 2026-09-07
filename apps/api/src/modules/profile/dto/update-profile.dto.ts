import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * US-58/US-60: ลูกค้าแก้โปรไฟล์ตัวเอง
 * phone: ส่งสตริงว่างหรือ null = ลบเบอร์ทิ้ง · เก็บลง DB แบบเข้ารหัสเสมอ (ห้าม log)
 */
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsBoolean() marketingOptedOut?: boolean;
}
