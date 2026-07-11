import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  list(brandId: string) {
    return this.prisma.contentLibrary.findMany({
      where: { brandId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  create(brandId: string, adminId: string, dto: { title: string; body: string }) {
    return this.prisma.contentLibrary.create({
      data: { brandId, title: dto.title, body: dto.body, createdBy: adminId },
    });
  }

  async update(brandId: string, id: string, dto: { title?: string; body?: string }) {
    await this.assert(brandId, id);
    return this.prisma.contentLibrary.update({ where: { id }, data: dto });
  }

  async remove(brandId: string, id: string) {
    await this.assert(brandId, id);
    await this.prisma.contentLibrary.delete({ where: { id } });
    return { deleted: true };
  }

  // กัน cross-tenant: ยืนยัน content เป็นของ brand นี้ก่อนแก้/ลบ
  async assert(brandId: string, id: string) {
    const c = await this.prisma.contentLibrary.findFirst({ where: { id, brandId } });
    if (!c) throw new NotFoundException('ไม่พบข้อความในคลัง');
    return c;
  }
}
