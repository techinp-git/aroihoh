import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class SetCodDto {
  @IsBoolean() enabled: boolean;
}

@UseGuards(AdminJwtGuard)
@Controller('admin/brands')
export class BrandsController {
  constructor(private readonly prisma: PrismaService) {}

  // คืนเฉพาะแบรนด์ที่ admin คนนี้เข้าถึงได้
  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.prisma.brand.findMany({
      where: { id: { in: admin.brandIds } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, isActive: true, codEnabled: true },
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
}
