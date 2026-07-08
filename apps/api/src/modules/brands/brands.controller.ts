import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';

// ให้ admin UI เลือกแบรนด์ได้โดยไม่ต้อง hardcode brandId (⚠️ AdminKeyGuard ชั่วคราว)
@UseGuards(AdminKeyGuard)
@Controller('admin/brands')
export class BrandsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }
}
