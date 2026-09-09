import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { RichMenuService } from './rich-menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';
import { contentTypeForName } from '../media/media.filename';
import type { RichMenuZone } from './richmenu';

class RichMenuDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() audienceId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsString() @MaxLength(32) preset?: string;
  @IsOptional() @IsArray() zones?: RichMenuZone[]; // ตรวจเชิงลึกที่ service (bounded ≤6)
  @IsOptional() @IsString() @MaxLength(14) chatBarText?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

// Rich Menu = ตั้งค่าระดับแบรนด์ → owner เท่านั้น (เหมือน line-config)
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner')
@Controller('admin/rich-menus')
export class RichMenuController {
  constructor(private readonly svc: RichMenuService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.svc.list(brandId);
  }

  @Post('preview')
  preview(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: RichMenuDto) {
    assertBrandAccess(admin, brandId);
    return this.svc.preview(brandId, { name: dto.name ?? 'preview', ...dto });
  }

  @Post('sync')
  sync(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.svc.sync(brandId);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: RichMenuDto) {
    assertBrandAccess(admin, brandId);
    return this.svc.create(brandId, admin.sub, { name: dto.name ?? '', ...dto });
  }

  @Post(':id/publish')
  publish(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.svc.publishRow(brandId, id);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: RichMenuDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.svc.update(brandId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Param('id') id: string) {
    assertBrandAccess(admin, brandId);
    return this.svc.remove(brandId, id);
  }
}

/**
 * เสิร์ฟรูป Rich Menu ที่ generate ไว้ (preview) — <img> ใส่ header ไม่ได้ → รับ admin JWT ผ่าน ?token=
 * (pattern เดียวกับ chat media) · ตรวจสิทธิ์แบรนด์ก่อนคืนไฟล์
 */
@Controller('admin/rich-menus')
export class RichMenuImageController {
  constructor(
    private readonly svc: RichMenuService,
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly config: ConfigService,
  ) {}

  @Get(':id/image')
  @Header('Cache-Control', 'private, max-age=60')
  async serve(@Param('id') id: string, @Query('token') token: string, @Res() res: Response) {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');
    let admin: AdminJwt;
    try {
      admin = jwt.verify(token || '', secret) as AdminJwt;
      if (admin.typ !== 'admin') throw new Error('not admin');
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    const meta = await this.svc.imageMeta(id);
    if (!meta?.imagePath) throw new NotFoundException('ยังไม่มีรูป');
    assertBrandAccess(admin, meta.brandId);
    const full = this.media.resolveExisting(meta.imagePath);
    if (!full) throw new NotFoundException('ไฟล์รูปหาย');
    res.setHeader('Content-Type', contentTypeForName(meta.imagePath));
    this.media.stream(full).pipe(res);
  }
}
