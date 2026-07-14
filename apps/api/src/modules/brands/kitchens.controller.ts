import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

// US-36: ลิสต์ครัวใน merchant ไว้ให้เลือกตอนสร้าง/แก้แบรนด์ (CRUD ครัวเต็ม = US-44)
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager')
@Controller('admin/kitchens')
export class KitchensController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.prisma.kitchen.findMany({
      where: { merchantId: admin.merchantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isOpen: true },
    });
  }
}
