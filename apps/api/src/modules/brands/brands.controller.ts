import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class SetCodDto {
  @IsBoolean() enabled: boolean;
}

class CreateBrandDto {
  @IsString() @MaxLength(80) name: string;
  @IsString() @MaxLength(60) @Matches(/^[a-z0-9-]+$/, { message: 'slug ใช้ได้แค่ a-z 0-9 และ -' })
  slug: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsArray() @IsString({ each: true }) kitchenIds: string[];
}

class UpdateBrandDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) kitchenIds?: string[];
  @IsOptional() @IsObject() theme?: Record<string, unknown>; // US-39: { primaryColor?: string }
}

const BRAND_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  codEnabled: true,
  logoUrl: true,
  theme: true,
} as const;

@UseGuards(AdminJwtGuard)
@Controller('admin/brands')
export class BrandsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AdminAuthService,
  ) {}

  // คืนเฉพาะแบรนด์ที่ admin คนนี้เข้าถึงได้ (+ ครัวที่ผูก ไว้โชว์)
  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.prisma.brand.findMany({
      where: { id: { in: admin.brandIds } },
      orderBy: { name: 'asc' },
      select: {
        ...BRAND_SELECT,
        brandKitchens: { select: { kitchenId: true } },
      },
    });
  }

  // US-36: สร้างแบรนด์ใหม่ + ผูกครัว (owner) — คืน token ใหม่ให้ owner เข้าถึงแบรนด์นี้ได้ทันที
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Post()
  async create(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateBrandDto) {
    await this.assertKitchensInMerchant(admin.merchantId, dto.kitchenIds);

    let brand;
    try {
      brand = await this.prisma.brand.create({
        data: {
          merchantId: admin.merchantId,
          name: dto.name,
          slug: dto.slug,
          logoUrl: dto.logoUrl,
          brandKitchens: { create: dto.kitchenIds.map((kitchenId) => ({ kitchenId })) },
        },
        select: BRAND_SELECT,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('slug นี้ถูกใช้แล้วใน merchant');
      throw e;
    }

    // refresh token: brandIds เป็น cache ต้องอัปเดตหลังชุดแบรนด์เปลี่ยน (ADR-06)
    const auth = await this.auth.issueTokenFor(admin.sub);
    return { brand, token: auth.token, admin: auth.admin };
  }

  // US-36: แก้แบรนด์ (ชื่อ/โลโก้/active/ครัวที่ผูก) — owner
  @UseGuards(RolesGuard)
  @Roles('owner')
  @Patch(':id')
  async update(
    @CurrentAdmin() admin: AdminJwt,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    assertBrandAccess(admin, id);
    if (dto.kitchenIds) await this.assertKitchensInMerchant(admin.merchantId, dto.kitchenIds);

    return this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme as any } : {}),
        ...(dto.kitchenIds
          ? {
              brandKitchens: {
                deleteMany: {},
                create: dto.kitchenIds.map((kitchenId) => ({ kitchenId })),
              },
            }
          : {}),
      },
      select: BRAND_SELECT,
    });
  }

  // US-07: เปิด/ปิดรับ COD (owner/manager เท่านั้น)
  @UseGuards(RolesGuard)
  @Roles('owner', 'manager')
  @Patch(':id/cod')
  async setCod(
    @CurrentAdmin() admin: AdminJwt,
    @Param('id') id: string,
    @Body() dto: SetCodDto,
  ) {
    assertBrandAccess(admin, id);
    const brand = await this.prisma.brand.update({
      where: { id },
      data: { codEnabled: dto.enabled },
      select: { id: true, codEnabled: true },
    });
    return brand;
  }

  // กันผูกครัวข้าม merchant (tenant isolation)
  private async assertKitchensInMerchant(merchantId: string, kitchenIds: string[]) {
    if (kitchenIds.length === 0) return;
    const found = await this.prisma.kitchen.findMany({
      where: { id: { in: kitchenIds }, merchantId },
      select: { id: true },
    });
    if (found.length !== new Set(kitchenIds).size) {
      throw new BadRequestException('ครัวบางรายการไม่อยู่ใน merchant นี้');
    }
  }
}
