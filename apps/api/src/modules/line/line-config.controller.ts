import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { LineConfigService } from './line-config.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class UpdateLineConfigDto {
  @IsOptional() @IsString() @MaxLength(64) channelId?: string;
  @IsOptional() @IsString() @MaxLength(64) liffId?: string;
  @IsOptional() @IsString() @MaxLength(256) channelSecret?: string;
  @IsOptional() @IsString() @MaxLength(512) channelAccessToken?: string;
}

// ตั้งค่า LINE เป็นความลับระดับแบรนด์ (credential) → owner เท่านั้น
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner')
@Controller('admin/line-config')
export class LineConfigController {
  constructor(private readonly config: LineConfigService) {}

  @Get()
  get(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.config.get(brandId);
  }

  @Put()
  update(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: UpdateLineConfigDto) {
    assertBrandAccess(admin, brandId);
    return this.config.update(brandId, dto);
  }

  @Post('test')
  test(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.config.test(brandId);
  }
}
