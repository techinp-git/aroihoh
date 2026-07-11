import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContentService } from './content.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class CreateContentDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) body: string;
}
class UpdateContentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(1000) body?: string;
}

// คลังข้อความ = ทรัพย์สินการตลาด → owner/manager เท่านั้น
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.content.list(brandId);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: CreateContentDto) {
    assertBrandAccess(admin, brandId);
    return this.content.create(brandId, admin.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.content.update(brandId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.content.remove(brandId, id);
  }
}
