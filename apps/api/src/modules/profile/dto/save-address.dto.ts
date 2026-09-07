import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** US-58: เพิ่มหมุดใหม่เข้าสมุดที่อยู่ */
export class SaveAddressDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsString() @IsNotEmpty() @MaxLength(300) detail: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

/** แก้หมุดเดิม — ส่งมาเฉพาะฟิลด์ที่เปลี่ยน (เขียนเองแทน PartialType เพื่อไม่เพิ่ม dependency) */
export class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) detail?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
