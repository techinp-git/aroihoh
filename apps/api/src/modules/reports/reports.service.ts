import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { summarizeOrders } from './report';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private todayBangkok(): string {
    // YYYY-MM-DD ตามเวลาไทย
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  // US-13: สรุปยอดรายวันของแบรนด์ (ตัดวันตามเวลาไทย)
  async dailySummary(brandId: string, date?: string) {
    const day = date || this.todayBangkok();
    const start = new Date(`${day}T00:00:00+07:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: { brandId, createdAt: { gte: start, lt: end } },
      select: { status: true, total: true },
    });

    return { date: day, ...summarizeOrders(orders) };
  }
}
