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
      marketingOptedOut: c.marketingOptedOut,
      createdAt: c.createdAt,
      ...computeCustomerStats(c.orders),
    }));
  }

  async detail(brandId: string, customerId: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, brandId },
      include: {
        // US-58: ตารางเดียวเก็บทั้ง snapshot ของออเดอร์ (isSaved=false) และหมุดในสมุดที่อยู่
        // หมุดที่ลูกค้าลบไปแล้ว (deletedAt) ไม่ต้องโชว์ — ป้ายแยก saved/snapshot ทำใน US-60
        addresses: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            label: true,
            detail: true,
            note: true,
            lat: true,
            lng: true,
            isSaved: true,
          },
        },
        // US-55: การ์ดแต้มในหน้าลูกค้า — ยอดคงเหลือ + ประวัติล่าสุด
        loyaltyLedger: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, type: true, points: true, note: true, createdAt: true },
        },
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
      marketingOptedOut: c.marketingOptedOut,
      createdAt: c.createdAt,
      addresses: c.addresses,
      pointsBalance: c.pointsBalance,
      loyaltyLedger: c.loyaltyLedger,
      orders: c.orders,
      ...computeCustomerStats(c.orders),
    };
  }

  /**
   * แท็กทั้งหมดที่ใช้จริงในแบรนด์นี้ + จำนวนลูกค้าต่อแท็ก
   * ใช้ทั้งตัวกรองในหน้าลูกค้า และ tag picker ใน rule builder ของ broadcast
   * (Prisma ไม่ group by element ใน array ได้ตรง ๆ → นับใน memory จากลิสต์ tags)
   */
  async tagCounts(brandId: string): Promise<{ tag: string; count: number }[]> {
    const rows = await this.prisma.customer.findMany({
      where: { brandId, tags: { isEmpty: false } },
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'th'));
  }

  // PDPA: ตั้งค่า opt-out รับข่าวสาร (แอดมินบันทึกตามคำขอลูกค้า) — broadcast จะข้ามคนนี้เสมอ
  async setOptOut(brandId: string, customerId: string, optedOut: boolean) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, brandId } });
    if (!c) throw new NotFoundException('ไม่พบลูกค้า');
    // PDPA: ให้ผลเหมือนฝั่งลูกค้ากดเอง — แอดมินเปิดรับข่าวสารให้ = บันทึกความยินยอม
    // (ร้านรับรองว่าได้ขอมาแล้ว เช่น ถามปากเปล่าหน้าร้าน) ไม่ใช่แค่ปลดธง
    // ไม่งั้นแอดมินกดเปิดแล้วลูกค้ายังไม่ถูกนับเป็นผู้รับ ดูเหมือนระบบพัง
    return this.prisma.customer.update({
      where: { id: customerId },
      data: optedOut
        ? { marketingOptedOut: true, marketingConsentAt: null, marketingConsentSource: null }
        : { marketingOptedOut: false, marketingConsentAt: new Date(), marketingConsentSource: 'admin' },
      select: { id: true, marketingOptedOut: true },
    });
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
