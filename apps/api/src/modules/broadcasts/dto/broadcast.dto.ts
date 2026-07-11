import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SegmentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class PreviewBroadcastDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment?: SegmentDto;

  // ประเมิน reach ของ audience ที่บันทึกไว้
  @IsOptional()
  @IsUUID()
  audienceId?: string;
}

// ต้องมีข้อความ (message หรือ contentId) และผู้รับ (segment หรือ audienceId) — service ตรวจ combination
export class CreateBroadcastDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsUUID()
  contentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment?: SegmentDto;

  @IsOptional()
  @IsUUID()
  audienceId?: string;
}
