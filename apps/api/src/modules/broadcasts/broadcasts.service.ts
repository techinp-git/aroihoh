import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveAudience, dedupeKeyFor, type Segment } from './segment';

@Injectable()
export class BroadcastsService {
  constructor(private readonly prisma: PrismaService) {}

  // ดึงลูกค้าของแบรนด์ (เฉพาะ field ที่ใช้ resolve — ไม่ดึง PII เช่น phoneEnc)
  private async brandCustomers(brandId: string) {
    return this.prisma.customer.findMany({
      where: { brandId },
      select: { id: true, tags: true, marketingOptedOut: true },
    });
  }

  /** ประเมินจำนวนผู้รับก่อนส่งจริง (โชว์ reach ให้แอดมินตัดสินใจ) — เคารพ opt-out */
  async preview(brandId: string, segment?: Segment | null) {
    const customers = await this.brandCustomers(brandId);
    const audience = resolveAudience(customers, segment);
    const optedOut = customers.filter((c) => c.marketingOptedOut).length;
    return {
      totalCustomers: customers.length,
      optedOut, // ถูกกันออกตาม PDPA
      audienceCount: audience.length,
    };
  }

  /**
   * สร้าง + จ่ายคิว broadcast
   * - resolve ผู้รับ (หัก opt-out) แล้วจอง message_logs (queued, dedupeKey) กันส่งซ้ำ (#7)
   * - การยิงเข้า LINE จริงรอ line worker (SETUP-1) → ตอนนี้ค้าง status 'queued'
   */
  async create(
    brandId: string,
    adminId: string,
    dto: { message: string; segment?: Segment | null },
  ) {
    const customers = await this.brandCustomers(brandId);
    const audience = resolveAudience(customers, dto.segment);

    return this.prisma.$transaction(async (tx) => {
      const broadcast = await tx.broadcast.create({
        data: {
          brandId,
          message: dto.message,
          segment: (dto.segment ?? undefined) as object | undefined,
          status: 'queued',
          audienceCount: audience.length,
          createdBy: adminId,
        },
      });

      if (audience.length > 0) {
        await tx.messageLog.createMany({
          data: audience.map((c) => ({
            brandId,
            customerId: c.id,
            type: 'broadcast' as const,
            dedupeKey: dedupeKeyFor(broadcast.id, c.id),
            status: 'queued' as const,
          })),
          skipDuplicates: true,
        });
      }
      // TODO(SETUP-1/line): enqueue BullMQ job ดึง message_logs(queued) ของ broadcast นี้ → push LINE → mark sent/failed
      return broadcast;
    });
  }

  /** ประวัติ broadcast ของแบรนด์ */
  list(brandId: string) {
    return this.prisma.broadcast.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** รายละเอียด + สรุปสถานะ message_logs ของ broadcast นั้น */
  async detail(brandId: string, id: string) {
    const broadcast = await this.prisma.broadcast.findFirst({ where: { id, brandId } });
    if (!broadcast) throw new NotFoundException('ไม่พบ broadcast');

    const logs = await this.prisma.messageLog.groupBy({
      by: ['status'],
      where: { brandId, type: 'broadcast', dedupeKey: { startsWith: `bcast:${id}:` } },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const l of logs) byStatus[l.status] = l._count._all;
    return { ...broadcast, byStatus };
  }
}
