import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from './line.client';

// รูปแบบ event จาก LINE webhook (เอาเฉพาะที่ใช้)
interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

@Injectable()
export class LineService {
  private readonly log = new Logger('LineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineClient,
  ) {}

  // upsert ลูกค้าจาก lineUserId (ดึงโปรไฟล์ทีหลังได้)
  private async upsertCustomer(brandId: string, lineUserId: string) {
    return this.prisma.customer.upsert({
      where: { brandId_lineUserId: { brandId, lineUserId } },
      create: { brandId, lineUserId },
      update: {},
      select: { id: true },
    });
  }

  /** ประมวลผล events ที่ verify signature แล้ว (US-10/21) */
  async handleEvents(brandId: string, events: LineEvent[]) {
    for (const ev of events) {
      try {
        const userId = ev.source?.userId;
        if (ev.type === 'message' && ev.message?.type === 'text' && userId) {
          const cust = await this.upsertCustomer(brandId, userId);
          await this.prisma.chatMessage.create({
            data: { brandId, customerId: cust.id, direction: 'inbound', text: ev.message.text ?? '', isRead: false },
          });
        } else if (ev.type === 'follow' && userId) {
          await this.upsertCustomer(brandId, userId);
          if (ev.replyToken) await this.line.replyText(brandId, ev.replyToken, 'ยินดีต้อนรับ! 🙏 กดเมนูเพื่อสั่งอาหารได้เลย');
        }
      } catch (e) {
        // ห้าม log PII — log แค่ประเภท error (PDPA #6)
        this.log.warn(`event ${ev.type} error: ${(e as Error).message}`);
      }
    }
  }

  /**
   * ยิง broadcast ที่ queued ออกจริง (worker ทำเอง on-demand; BullMQ ไว้ scale — US-09)
   * ดึง message_logs(queued) ของ broadcast → push ทีละคน → mark sent/failed + อัปเดตนับ
   * กันส่งซ้ำด้วย dedupeKey (แถวเดิมเป็น sent แล้วจะไม่โดนดึงอีก)
   */
  async dispatchBroadcast(brandId: string, broadcastId: string) {
    const bc = await this.prisma.broadcast.findFirst({ where: { id: broadcastId, brandId } });
    if (!bc) return { dispatched: 0, skipped: true };
    if (!(await this.line.isConfigured(brandId))) return { dispatched: 0, skipped: true };

    const logs = await this.prisma.messageLog.findMany({
      where: { brandId, type: 'broadcast', status: 'queued', dedupeKey: { startsWith: `bcast:${broadcastId}:` } },
    });
    let sent = 0;
    let failed = 0;
    await this.prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'sending' } });

    for (const lg of logs) {
      const cust = lg.customerId
        ? await this.prisma.customer.findUnique({ where: { id: lg.customerId }, select: { lineUserId: true } })
        : null;
      const r = cust ? await this.line.pushText(brandId, cust.lineUserId, bc.message) : { ok: false };
      if (r.ok) {
        sent++;
        await this.prisma.messageLog.update({ where: { id: lg.id }, data: { status: 'sent' } });
      } else {
        failed++;
        await this.prisma.messageLog.update({ where: { id: lg.id }, data: { status: 'failed', error: 'push failed' } });
      }
    }

    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: failed && !sent ? 'failed' : 'sent', sentCount: sent, failedCount: failed },
    });
    return { dispatched: sent, failed };
  }
}
