import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { LineConfigService } from './line-config.service';
import { LineService } from './line.service';
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

// US-10: รูป Rich Menu — ต้องเป็น URL สาธารณะที่ LINE (และ server เรา) โหลดได้
class ApplyRichMenuDto {
  @IsString() @IsNotEmpty() @IsUrl({ require_protocol: true }) @MaxLength(1024) imageUrl: string;
}

// ตั้งค่า LINE เป็นความลับระดับแบรนด์ (credential) → owner เท่านั้น
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner')
@Controller('admin/line-config')
export class LineConfigController {
  constructor(
    private readonly config: LineConfigService,
    private readonly line: LineService,
  ) {}

  @Get()
  get(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.config.get(brandId);
  }

  // สรุปการใช้ reply(ฟรี) vs push(เสียโควตา)
  @Get('usage')
  usage(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.line.usage(brandId);
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

  // US-10: ดูตัวอย่าง Rich Menu ที่จะสร้าง (ไม่ยิง LINE) — ตรวจ layout + สเปครูปก่อน
  @Get('richmenu/preview')
  previewRichMenu(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.config.previewRichMenu(brandId);
  }

  // US-10: สร้าง + อัปโหลดรูป + ตั้งเป็นเมนูเริ่มต้น (ยิง LINE จริง)
  @Post('richmenu')
  applyRichMenu(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Body() dto: ApplyRichMenuDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.config.applyRichMenu(brandId, dto.imageUrl);
  }
}
