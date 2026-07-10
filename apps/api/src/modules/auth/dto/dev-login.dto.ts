import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class DevLoginDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @IsOptional()
  @IsString()
  name?: string;
}
