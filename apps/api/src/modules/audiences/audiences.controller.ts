import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { CreateAudienceDto, PreviewRulesDto, UpdateAudienceDto } from './dto/audience.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/audiences')
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  // ⚠️ route คงที่ต้องมาก่อน :id
  @Get('presets')
  presets() {
    return this.audiences.presets();
  }

  // ประเมิน reach ของ rules สด (ยังไม่บันทึก) — ใช้ตอนสร้าง/แก้กลุ่ม
  @Post('preview')
  preview(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: PreviewRulesDto) {
    assertBrandAccess(admin, brandId);
    return this.audiences.previewRules(brandId, dto.rules);
  }

  @Get()
  list(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.audiences.list(brandId);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: CreateAudienceDto) {
    assertBrandAccess(admin, brandId);
    return this.audiences.create(brandId, admin.sub, dto);
  }

  // reach ของ audience ที่บันทึกแล้ว (สด ณ ตอนเรียก)
  @Get(':id/preview')
  previewSaved(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.audiences.previewSaved(brandId, id);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAudienceDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.audiences.update(brandId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.audiences.remove(brandId, id);
  }
}
