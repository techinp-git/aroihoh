import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { summarizeOrders } from './report';
import { summarizeMargin, computeBreakeven, marginByMenu } from './margin';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private todayBangkok(): string {
    // YYYY-MM-DD ตามเวลาไทย
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  private dayWindow(date?: string) {
    const day = date || this.todayBangkok();
    const start = new Date(`${day}T00:00:00+07:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { day, start, end };
  }

  // US-13: สรุปยอดรายวันของแบรนด์ (ตัดวันตามเวลาไทย)
  async dailySummary(brandId: string, date?: string) {
    const { day, start, end } = this.dayWindow(date);
    const orders = await this.prisma.order.findMany({
      where: { brandId, createdAt: { gte: start, lt: end } },
      select: { status: true, total: true },
    });
    return { date: day, ...summarizeOrders(orders) };
  }

  /**
   * US-19: มาร์จิ้น/กล่อง + จุดคุ้มทุนรายวัน
   * ใช้ unitCost ที่ snapshot ไว้ตอนสั่ง (ไม่ใช่ต้นทุนปัจจุบัน) → แก้ต้นทุนเมนูทีหลังไม่กระทบรายงานเก่า
   */
  async marginDaily(brandId: string, date?: string) {
    const { day, start, end } = this.dayWindow(date);
    const [orders, brand] = await Promise.all([
      this.prisma.order.findMany({
        where: { brandId, createdAt: { gte: start, lt: end } },
        select: {
          status: true,
          subtotal: true,
          deliveryFee: true,
          discount: true,
          total: true,
          items: { select: { qty: true, unitPrice: true, unitCost: true, lineTotal: true, nameSnapshot: true } },
        },
      }),
      this.prisma.brand.findUnique({ where: { id: brandId }, select: { fixedCostDaily: true } }),
    ]);

    const summary = summarizeMargin(orders);
    const breakeven = computeBreakeven(summary, brand?.fixedCostDaily ?? null);
    // เมนูจากออเดอร์ที่ไม่ยกเลิกเท่านั้น
    const byMenu = marginByMenu(orders.filter((o) => o.status !== 'cancelled').flatMap((o) => o.items));

    return { date: day, fixedCostDaily: brand?.fixedCostDaily ?? null, summary, breakeven, byMenu };
  }

  /** US-19: ตั้งค่าใช้จ่ายคงที่ต่อวัน (owner) — ใช้หาจุดคุ้มทุน */
  async setFixedCost(brandId: string, fixedCostDaily: number | null) {
    await this.prisma.brand.update({ where: { id: brandId }, data: { fixedCostDaily } });
    return { ok: true, fixedCostDaily };
  }

  // US-38: สรุปรวมระดับ merchant — ยอดรวมทุกแบรนด์ + แยกต่อแบรนด์ (owner/manager)
  async merchantDaily(brandIds: string[], date?: string) {
    const { day, start, end } = this.dayWindow(date);
    if (brandIds.length === 0) {
      return { date: day, total: summarizeOrders([]), brands: [] };
    }
    const [orders, brands] = await Promise.all([
      this.prisma.order.findMany({
        where: { brandId: { in: brandIds }, createdAt: { gte: start, lt: end } },
        select: { brandId: true, status: true, total: true },
      }),
      this.prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }),
    ]);
    const nameOf = new Map(brands.map((b) => [b.id, b.name]));

    const byBrand = brandIds
      .map((bid) => ({
        brandId: bid,
        brandName: nameOf.get(bid) ?? bid,
        ...summarizeOrders(orders.filter((o) => o.brandId === bid)),
      }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return { date: day, total: summarizeOrders(orders), brands: byBrand };
  }
}
