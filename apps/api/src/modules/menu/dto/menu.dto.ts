import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() brandId: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateMenuItemDto {
  @IsString() @IsNotEmpty() brandId: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) price: number; // สตางค์
  @IsOptional() @IsString() imageUrl?: string;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() categoryId?: string;
}

export class SetAvailabilityDto {
  @IsBoolean() isAvailable: boolean;
}
