import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeCustomerStats } from './customer-stats';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // PDPA: ไม่คืน phoneEnc; ทุก query กรอง brandId
  async list(brandId: string, q?: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        brandId,
        ...(q ? { displayName: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { orders: { select: { status: true, total: true, createdAt: true } } },
    });
    return customers.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      pictureUrl: c.pictureUrl,
      lineUserId: c.lineUserId,
      tags: c.tags,
      createdAt: c.createdAt,
      ...computeCustomerStats(c.orders),
    }));
  }

  async detail(brandId: string, customerId: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, brandId },
      include: {
        addresses: { select: { id: true, label: true, detail: true, lat: true, lng: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: { select: { id: true, nameSnapshot: true, qty: true, lineTotal: true } } },
        },
      },
    });
    if (!c) throw new NotFoundException('ไม่พบลูกค้า');
    return {
      id: c.id,
      displayName: c.displayName,
      pictureUrl: c.pictureUrl,
      lineUserId: c.lineUserId,
      tags: c.tags,
      createdAt: c.createdAt,
      addresses: c.addresses,
      orders: c.orders,
      ...computeCustomerStats(c.orders),
    };
  }

  // US-21: ตั้งแท็กลูกค้า (แทนที่ชุดเดิม)
  async setTags(brandId: string, customerId: string, tags: string[]) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, brandId } });
    if (!c) throw new NotFoundException('ไม่พบลูกค้า');
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
    if (clean.some((t) => t.length > 30)) {
      throw new BadRequestException('แท็กยาวเกิน 30 ตัวอักษร');
    }
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { tags: clean },
      select: { id: true, tags: true },
    });
    return updated;
  }
}
