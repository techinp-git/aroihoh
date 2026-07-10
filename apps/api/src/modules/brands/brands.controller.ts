import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

// คืนเฉพาะแบรนด์ที่ admin คนนี้เข้าถึงได้ (owner/manager = ทุกแบรนด์ merchant, staff = ที่ผูกไว้)
@UseGuards(AdminJwtGuard)
@Controller('admin/brands')
export class BrandsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.prisma.brand.findMany({
      where: { id: { in: admin.brandIds } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }
}
