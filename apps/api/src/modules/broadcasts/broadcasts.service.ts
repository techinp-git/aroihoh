import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AudiencesService } from '../audiences/audiences.service';
import { ContentService } from '../content/content.service';
import { LineService } from '../line/line.service';
import { resolveAudience, dedupeKeyFor, type Segment } from './segment';
import type { AudienceRules } from '../audiences/rules';

export interface CreateBroadcastInput {
  message?: string;
  segment?: Segment | null;
  contentId?: string;
  audienceId?: string;
}

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudiencesService,
    private readonly content: ContentService,
    private readonly line: LineService,
  ) {}

  /** ยิง broadcast ที่ queued ออกจริงผ่าน LINE (ถ้าผูก SETUP-1 แล้ว) — กันส่งซ้ำด้วย message_logs */
  async dispatch(brandId: string, id: string) {
    const bc = await this.prisma.broadcast.findFirst({ where: { id, brandId } });
    if (!bc) throw new NotFoundException('ไม่พบ broadcast');
    return this.line.dispatchBroadcast(brandId, id);
  }

  // ดึงลูกค้าของแบรนด์ (แค่ field ที่ใช้กับ tag segment — path เดิม)
  private async brandCustomers(brandId: string) {
    return this.prisma.customer.findMany({
      where: { brandId },
      select: { id: true, tags: true, marketingOptedOut: true, marketingConsentAt: true },
    });
  }

  /**
   * ประเมินผู้รับก่อนส่ง — รองรับ 2 ทาง:
   *  - audienceId → ใช้ rules ของกลุ่มที่บันทึกไว้ (dynamic, ผ่าน AudiencesService)
   *  - segment (tags) → path เดิม (ad-hoc)
   */
  async preview(brandId: string, opts: { segment?: Segment | null; audienceId?: string }) {
    if (opts.audienceId) return this.audiences.previewSaved(brandId, opts.audienceId);
    const customers = await this.brandCustomers(brandId);
    const audience = resolveAudience(customers, opts.segment);
    return {
      totalCustomers: customers.length,
      optedOut: customers.filter((c) => c.marketingOptedOut).length,
      // PDPA: แยกให้เห็นว่า reach ที่หายไปมาจาก "ปฏิเสธ" หรือ "ยังไม่เคยถูกขอความยินยอม"
      // ไม่งั้นเจ้าของร้านเห็นตัวเลขตกแล้วนึกว่าระบบพัง
      noConsent: customers.filter((c) => !c.marketingOptedOut && c.marketingConsentAt == null).length,
      audienceCount: audience.length,
    };
  }

  /**
   * สร้าง + จ่ายคิว broadcast
   *  - ข้อความ: จาก contentId (คลัง) หรือพิมพ์สด (message)
   *  - ผู้รับ: จาก audienceId (rules) หรือ segment (tags) — หัก opt-out เสมอ
   *  - จอง message_logs (queued, dedupeKey) กันส่งซ้ำ (#7); ยิง LINE จริงรอ SETUP-1
   */
  async create(brandId: string, adminId: string, input: CreateBroadcastInput) {
    // 1) resolve ข้อความ
    let message = input.message?.trim();
    if (input.contentId) {
      const c = await this.content.assert(brandId, input.contentId); // กัน cross-tenant
      message = c.body;
    }
    if (!message) throw new BadRequestException('ต้องมีข้อความ (เลือกจากคลัง หรือพิมพ์สด)');

    // 2) resolve ผู้รับ
    let recipientIds: string[];
    if (input.audienceId) {
      const a = await this.audiences.get(brandId, input.audienceId); // กัน cross-tenant + not found
      recipientIds = await this.audiences.resolveIds(brandId, a.rules as unknown as AudienceRules);
    } else {
      const customers = await this.brandCustomers(brandId);
      recipientIds = resolveAudience(customers, input.segment).map((c) => c.id);
    }

    // 3) บันทึก + จองคิว
    return this.prisma.$transaction(async (tx) => {
      const broadcast = await tx.broadcast.create({
        data: {
          brandId,
          message,
          segment: (input.segment ?? undefined) as object | undefined,
          contentId: input.contentId ?? null,
          audienceId: input.audienceId ?? null,
          status: 'queued',
          audienceCount: recipientIds.length,
          createdBy: adminId,
        },
      });
      if (recipientIds.length > 0) {
        await tx.messageLog.createMany({
          data: recipientIds.map((cid) => ({
            brandId,
            customerId: cid,
            type: 'broadcast' as const,
            dedupeKey: dedupeKeyFor(broadcast.id, cid),
            status: 'queued' as const,
          })),
          skipDuplicates: true,
        });
      }
      // ยิงจริงอยู่ที่ POST /admin/broadcasts/:id/dispatch (หน้า Compose เรียกต่อทันทีหลัง create)
      // แยกขั้นไว้เพราะ dispatch วนยิงทีละคน — ถ้าหลุดกลางคัน แถวที่ยัง queued กด dispatch ซ้ำได้
      // dedupeKey บน message_logs กันส่งซ้ำให้ (#7)
      return broadcast;
    });
  }

  list(brandId: string) {
    return this.prisma.broadcast.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        content: { select: { title: true } },
        audience: { select: { name: true } },
      },
    });
  }

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
