import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const ROLES = ['owner', 'manager', 'staff', 'kitchen', 'chat_agent'] as const;

export class CreateAdminUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsString() name: string;
  @IsIn(ROLES) role: (typeof ROLES)[number];
  // จำเป็นเมื่อ role = staff (owner/manager เห็นทุกแบรนด์อยู่แล้ว)
  @IsOptional() @IsArray() @ArrayNotEmpty() brandIds?: string[];
}

export class UpdateAdminUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(ROLES) role?: (typeof ROLES)[number];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() brandIds?: string[];
}
