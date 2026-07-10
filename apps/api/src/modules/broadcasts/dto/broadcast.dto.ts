import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
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
}

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000) // คุมความยาว — ป้องกัน payload เกิน + ค่า LINE
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentDto)
  segment?: SegmentDto;
}
