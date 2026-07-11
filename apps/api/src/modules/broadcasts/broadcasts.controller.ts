import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto, PreviewBroadcastDto } from './dto/broadcast.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

// broadcast = ส่งถึงลูกค้าจำนวนมาก + กินโควตา LINE → owner/manager เท่านั้น
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.broadcasts.list(brandId);
  }

  // ประเมิน reach ก่อนส่ง (ไม่สร้างอะไร)
  @Post('preview')
  preview(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Body() dto: PreviewBroadcastDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.broadcasts.preview(brandId, { segment: dto.segment, audienceId: dto.audienceId });
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Body() dto: CreateBroadcastDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.broadcasts.create(brandId, admin.sub, {
      message: dto.message,
      contentId: dto.contentId,
      segment: dto.segment,
      audienceId: dto.audienceId,
    });
  }

  // ยิงออกจริงผ่าน LINE (ถ้าเชื่อม SETUP-1 แล้ว) — ยังไม่เชื่อม = skipped
  @Post(':id/dispatch')
  dispatch(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.broadcasts.dispatch(brandId, id);
  }

  // ⚠️ ต้องอยู่หลัง route คงที่อื่น ๆ (preview) — แต่ preview เป็น POST คนละ method จึงไม่ชน
  @Get(':id')
  detail(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.broadcasts.detail(brandId, id);
  }
}
