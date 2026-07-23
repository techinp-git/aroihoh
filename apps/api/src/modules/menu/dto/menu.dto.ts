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

// US-36b: คัดลอกเมนูข้ามแบรนด์
export class CopyMenuDto {
  @IsString() @IsNotEmpty() sourceBrandId: string;
  @IsString() @IsNotEmpty() targetBrandId: string;
}

export class CreateMenuItemDto {
  @IsString() @IsNotEmpty() brandId: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) price: number; // สตางค์
  @IsOptional() @IsInt() @Min(0) costPrice?: number; // US-19: ต้นทุนวัตถุดิบ (สตางค์)
  @IsOptional() @IsString() imageUrl?: string;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) costPrice?: number; // US-19
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() categoryId?: string;
}

export class SetAvailabilityDto {
  @IsBoolean() isAvailable: boolean;
}
