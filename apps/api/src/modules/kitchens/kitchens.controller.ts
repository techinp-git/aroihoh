import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { KitchensService } from './kitchens.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

class CreateKitchenDto {
  @IsString() @MaxLength(80) name: string;
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsNumber() @Min(0.1) @Max(50) maxDistanceKm: number;
  @IsInt() @Min(0) flatFee: number; // สตางค์
}

class UpdateKitchenDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @IsNumber() @Min(0.1) @Max(50) maxDistanceKm?: number;
  @IsOptional() @IsInt() @Min(0) flatFee?: number;
}

// US-44: จัดการครัว/location — owner/manager (ครัวเป็น merchant-level, กรอง merchantId เสมอ)
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/kitchens')
export class KitchensController {
  constructor(private readonly kitchens: KitchensService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.kitchens.list(admin.merchantId);
  }

  @Roles('owner')
  @Post()
  create(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateKitchenDto) {
    return this.kitchens.create(admin.merchantId, dto);
  }

  @Roles('owner')
  @Patch(':id')
  update(@CurrentAdmin() admin: AdminJwt, @Param('id') id: string, @Body() dto: UpdateKitchenDto) {
    return this.kitchens.update(admin.merchantId, id, dto);
  }
}
