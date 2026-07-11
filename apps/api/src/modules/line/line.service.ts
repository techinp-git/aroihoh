import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from './line.client';

// รูปแบบ event จาก LINE webhook (เอาเฉพาะที่ใช้)
interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

type MsgType = 'welcome' | 'auto_reply' | 'chat' | 'status_push';

interface SendOpts {
  replyToken?: string; // ถ้ามี = พยายาม reply (ฟรี) ก่อน
  type: MsgType;
  customerId?: string;
  dedupeKey?: string; // idempotency (เช่น status push) — ไม่ใส่ = gen ใหม่ทุกครั้ง
}

@Injectable()
export class LineService {
  private readonly log = new Logger('LineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineClient,
  ) {}

  // upsert ลูกค้าจาก lineUserId + ดึงชื่อ/รูปโปรไฟล์ถ้ายังไม่มี (แชตจะได้เห็นชื่อจริง)
  private async upsertCustomer(brandId: string, lineUserId: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { brandId_lineUserId: { brandId, lineUserId } },
      select: { id: true, displayName: true },
    });
    if (existing?.displayName) return existing; // มีชื่อแล้ว ไม่ต้องเรียก LINE ซ้ำ
    const profile = await this.line.getProfile(brandId, lineUserId).catch(() => null);
    return this.prisma.customer.upsert({
      where: { brandId_lineUserId: { brandId, lineUserId } },
      create: { brandId, lineUserId, displayName: profile?.displayName, pictureUrl: profile?.pictureUrl },
      update: profile ? { displayName: profile.displayName, pictureUrl: profile.pictureUrl } : {},
      select: { id: true },
    });
  }

  /**
   * ตัวส่งกลาง — ตัดสินเอง reply (ฟรี) หรือ push (นับโควตา) แล้ว log ช่องทางที่ใช้
   *  - มี replyToken → ลอง reply ก่อน; สำเร็จ = ฟรี, ล้มเหลว (หมดอายุ/ใช้แล้ว) → ตกลง push
   *  - ไม่มี replyToken → push ตรง
   * บันทึก message_logs (channel=reply|push) เพื่อดูสัดส่วนประหยัดโควตา
   */
  async sendToCustomer(brandId: string, lineUserId: string, text: string, opts: SendOpts) {
    let via: 'reply' | 'push' = 'push';
    let ok = false;
    let skipped = false;

    if (opts.replyToken) {
      const r = await this.line.replyText(brandId, opts.replyToken, text);
      if (r.ok) {
        via = 'reply';
        ok = true;
      } else if (r.skipped) {
        skipped = true; // ยังไม่ผูก LINE
      }
    }
    if (!ok && !skipped) {
      const p = await this.line.pushText(brandId, lineUserId, text);
      via = 'push';
      ok = p.ok;
      skipped = !!p.skipped;
    }

    // log เฉพาะเมื่อได้ส่งจริง/พยายามส่ง (ไม่ log ตอน dev skip เพื่อไม่ให้ตัวเลขเพี้ยน)
    if (!skipped) {
      await this.prisma.messageLog
        .create({
          data: {
            brandId,
            customerId: opts.customerId ?? null,
            type: opts.type,
            channel: via,
            dedupeKey: opts.dedupeKey ?? `${opts.type}:${randomUUID()}`,
            status: ok ? 'sent' : 'failed',
          },
        })
        .catch(() => undefined); // ชนกับ dedupeKey เดิม (idempotent) → ไม่ต้องพัง
    }
    return { via, ok, skipped };
  }

  // ข้อความ auto-reply ตาม keyword (ใช้ reply token = ฟรี)
  private async autoReplyText(brandId: string, text: string): Promise<string> {
    const t = text.toLowerCase();
    if (/เมนู|สั่ง|order|อาหาร/.test(t)) {
      const brand = await this.prisma.brand.findUnique({ where: { id: brandId }, select: { liffId: true } });
      return brand?.liffId
        ? `🍜 สั่งอาหารที่นี่เลยครับ: https://liff.line.me/${brand.liffId}`
        : '🍜 กำลังเปิดให้สั่งผ่าน LINE เร็ว ๆ นี้ครับ 🙏';
    }
    return 'ได้รับข้อความแล้วครับ 🙏 เดี๋ยวร้านรีบตอบให้นะครับ';
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
          // auto-reply ด้วย reply token (ฟรี ไม่กินโควตา) + เก็บ outbound ลงแชต
          const reply = await this.autoReplyText(brandId, ev.message.text ?? '');
          const sent = await this.sendToCustomer(brandId, userId, reply, {
            replyToken: ev.replyToken,
            type: 'auto_reply',
            customerId: cust.id,
          });
          if (sent.ok) {
            await this.prisma.chatMessage.create({
              data: { brandId, customerId: cust.id, direction: 'outbound', text: reply, isRead: true },
            });
          }
        } else if (ev.type === 'follow' && userId) {
          const cust = await this.upsertCustomer(brandId, userId);
          await this.sendToCustomer(brandId, userId, 'ยินดีต้อนรับ! 🙏 พิมพ์ "เมนู" เพื่อสั่งอาหารได้เลยครับ', {
            replyToken: ev.replyToken,
            type: 'welcome',
            customerId: cust.id,
          });
        }
      } catch (e) {
        // ห้าม log PII — log แค่ประเภท error (PDPA #6)
        this.log.warn(`event ${ev.type} error: ${(e as Error).message}`);
      }
    }
  }

  /** สรุปการใช้ช่องทาง reply(ฟรี) vs push(เสียโควตา) — ให้เห็นว่าประหยัดไปเท่าไร */
  async usage(brandId: string) {
    const rows = await this.prisma.messageLog.groupBy({
      by: ['channel'],
      where: { brandId, channel: { not: null }, status: 'sent' },
      _count: { _all: true },
    });
    const reply = rows.find((r) => r.channel === 'reply')?._count._all ?? 0;
    const push = rows.find((r) => r.channel === 'push')?._count._all ?? 0;
    return { reply, push, total: reply + push, savedByReply: reply };
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
        await this.prisma.messageLog.update({ where: { id: lg.id }, data: { status: 'sent', channel: 'push' } });
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
