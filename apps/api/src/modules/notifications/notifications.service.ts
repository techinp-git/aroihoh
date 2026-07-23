/**
 * US-09 — คิวแจ้งเตือนลูกค้าผ่าน LINE (BullMQ + กันส่งซ้ำด้วย message_logs)
 *
 * flow: enqueue() → จองแถว message_logs(queued, dedupeKey unique) → push job เข้า BullMQ
 *       worker → ส่งจริงผ่าน LineClient → mark sent/failed
 *
 * degrade อย่างปลอดภัย:
 *  - ไม่มี REDIS_URL (dev/CI/เครื่อง solo) → ทำงาน "inline" ทันทีแทนเข้าคิว ระบบยังเดินได้
 *  - ไม่มี LINE keys (ก่อน SETUP-1) → LineClient คืน skipped, ลบแถวที่จองไว้ทิ้ง (ตัวเลขจะได้ไม่เพี้ยน)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@aroihoh/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from '../line/line.client';
import { buildOrderConfirmFlex, orderConfirmAltText, statusUpdateText, shouldNotify } from '../line/flex';
import { buildDedupeKey, isValidJob, type NotifyJob, type NotifyKind } from './dedupe';

const QUEUE_NAME = 'line-notify';

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly log = new Logger('Notifications');
  private queue?: import('bullmq').Queue;
  private worker?: import('bullmq').Worker;
  private connection?: import('ioredis').Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineClient,
  ) {
    void this.initQueue();
  }

  /** ต่อ Redis + สร้าง worker — ไม่มี REDIS_URL ก็ไม่พัง (inline mode) */
  private async initQueue() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.warn('ไม่มี REDIS_URL — โหมด inline (ส่งทันที ไม่เข้าคิว) เหมาะกับ dev/CI เท่านั้น');
      return;
    }
    try {
      const { Queue, Worker } = await import('bullmq');
      const IORedis = (await import('ioredis')).default;
      // BullMQ ต้องการ maxRetriesPerRequest=null สำหรับ connection ของ worker
      this.connection = new IORedis(url, { maxRetriesPerRequest: null });
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          if (!isValidJob(job.data)) throw new Error('invalid job payload');
          return this.dispatch(job.data);
        },
        { connection: this.connection, concurrency: 3 }, // เบา ๆ กันชน rate limit LINE
      );
      this.worker.on('failed', (job, err) => {
        this.log.warn(`job ${job?.id} failed: ${err.message}`); // ห้าม log payload/PII (PDPA #6)
      });
      this.log.log(`คิว ${QUEUE_NAME} พร้อม (Redis)`);
    } catch (e) {
      this.log.error(`ต่อ Redis ไม่ได้ → fallback inline: ${(e as Error).message}`);
      this.queue = undefined;
    }
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
  }

  /**
   * จองแถว message_logs แล้วส่งเข้าคิว
   * คืน { deduped: true } ถ้ามีแถว dedupeKey นี้อยู่แล้ว = เคยส่ง/กำลังส่งอยู่ → ไม่ทำซ้ำ
   */
  private async enqueue(
    kind: NotifyKind,
    brandId: string,
    orderId: string,
    customerId: string,
    status?: OrderStatus,
  ): Promise<{ queued: boolean; deduped?: boolean; inline?: boolean }> {
    const dedupeKey = buildDedupeKey(kind, orderId, status);

    let logRow;
    try {
      logRow = await this.prisma.messageLog.create({
        data: {
          brandId,
          customerId,
          orderId,
          type: kind === 'order_confirm' ? 'flex_confirm' : 'status_push',
          dedupeKey,
          status: 'queued',
        },
        select: { id: true },
      });
    } catch (e) {
      // P2002 = unique violation บน dedupeKey → เคยจองแล้ว ถือว่าสำเร็จแบบ idempotent
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { queued: false, deduped: true };
      }
      throw e;
    }

    const job: NotifyJob = { kind, brandId, orderId, status, messageLogId: logRow.id };

    if (!this.queue) {
      // inline mode — ส่งเลย ไม่ให้ dev/CI ต้องมี Redis
      await this.dispatch(job).catch((e) => this.log.warn(`inline dispatch ล้มเหลว: ${(e as Error).message}`));
      return { queued: true, inline: true };
    }

    await this.queue.add(kind, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
    return { queued: true };
  }

  /** ส่งจริง — เรียกจาก worker หรือ inline mode */
  private async dispatch(job: NotifyJob): Promise<{ sent: boolean; skipped?: boolean }> {
    const order = await this.prisma.order.findFirst({
      where: { id: job.orderId, brandId: job.brandId }, // กรอง tenant key เสมอ (กติกาเหล็ก #1)
      include: {
        items: true,
        customer: { select: { lineUserId: true } },
        brand: { select: { name: true, liffId: true, theme: true } },
      },
    });
    if (!order) {
      await this.markFailed(job.messageLogId, 'order not found');
      return { sent: false };
    }

    const theme = order.brand.theme as { primaryColor?: string } | null;
    let ok = false;

    if (job.kind === 'order_confirm') {
      const flexOrder = {
        id: order.id,
        status: order.status as OrderStatus,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        total: order.total,
        paymentMethod: order.paymentMethod as 'promptpay' | 'cod',
        note: order.note,
        items: order.items.map((i) => ({ nameSnapshot: i.nameSnapshot, qty: i.qty, lineTotal: i.lineTotal })),
      };
      const bubble = buildOrderConfirmFlex(flexOrder, {
        brandName: order.brand.name,
        liffId: order.brand.liffId,
        primaryColor: theme?.primaryColor,
      });
      const r = await this.line.pushFlex(
        job.brandId,
        order.customer.lineUserId,
        orderConfirmAltText(flexOrder),
        bubble,
      );
      if (r.skipped) return this.unreserve(job.messageLogId);
      ok = r.ok;
    } else {
      const text = statusUpdateText({ id: order.id, status: order.status as OrderStatus }, order.brand.name);
      const r = await this.line.pushText(job.brandId, order.customer.lineUserId, text);
      if (r.skipped) return this.unreserve(job.messageLogId);
      ok = r.ok;
    }

    if (ok) {
      await this.prisma.messageLog.update({
        where: { id: job.messageLogId },
        data: { status: 'sent', channel: 'push' },
      });
      return { sent: true };
    }
    await this.markFailed(job.messageLogId, 'line push failed');
    throw new Error('line push failed'); // ให้ BullMQ retry ตาม attempts/backoff
  }

  /** ยังไม่ผูก LINE (ก่อน SETUP-1) → ถอนการจองทิ้ง เพื่อให้ส่งใหม่ได้เมื่อ keys มาแล้ว */
  private async unreserve(messageLogId: string) {
    await this.prisma.messageLog.delete({ where: { id: messageLogId } }).catch(() => undefined);
    return { sent: false, skipped: true };
  }

  private async markFailed(messageLogId: string, error: string) {
    await this.prisma.messageLog
      .update({ where: { id: messageLogId }, data: { status: 'failed', error } })
      .catch(() => undefined);
  }

  // ─────────────────────── public API (เรียกจาก OrdersService) ───────────────────────

  /** US-08: ส่งใบยืนยันออเดอร์ (Flex) — 1 ใบต่อ 1 ออเดอร์ */
  async notifyOrderConfirmed(brandId: string, orderId: string, customerId: string) {
    return this.enqueue('order_confirm', brandId, orderId, customerId);
  }

  /** แจ้งเปลี่ยนสถานะ — ส่งเฉพาะสถานะสำคัญ (ประหยัดโควตา) */
  async notifyStatusChanged(brandId: string, orderId: string, customerId: string, status: OrderStatus) {
    if (!shouldNotify(status)) return { queued: false, skipped: true };
    return this.enqueue('status_push', brandId, orderId, customerId, status);
  }

  /** สถานะคิว — ให้ admin ดูว่ามีงานค้าง/ล้มเหลวเท่าไร */
  async stats(brandId: string) {
    const rows = await this.prisma.messageLog.groupBy({
      by: ['status'],
      where: { brandId, type: { in: ['flex_confirm', 'status_push'] } },
      _count: { _all: true },
    });
    const get = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    return {
      mode: this.queue ? 'redis' : 'inline',
      queued: get('queued'),
      sent: get('sent'),
      failed: get('failed'),
    };
  }
}
