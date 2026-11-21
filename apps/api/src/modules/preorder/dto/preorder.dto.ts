import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SetCutoffDto {
  /** "HH:MM" เวลาไทย — เวลาปิดรับออเดอร์ของวันถัดไป */
  @IsString() @IsNotEmpty() cutoffTime: string;
}

export class CreateSlotDto {
  @IsString() @IsNotEmpty() @MaxLength(40) name: string;
  @IsString() @IsNotEmpty() startTime: string;
  @IsString() @IsNotEmpty() endTime: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) sortOrder?: number;
}

export class UpdateSlotDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() startTime?: string;
  @IsOptional() @IsString() @IsNotEmpty() endTime?: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
