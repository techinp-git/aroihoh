import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetPauseDto {
  @IsBoolean() isOpen: boolean;
}

export class SetHoursDto {
  @IsOptional() @IsString() openTime?: string | null;
  @IsOptional() @IsString() closeTime?: string | null;
}
