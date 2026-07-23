/**
 * US-09 — pure logic ของคิวแจ้งเตือน (dedupe key + นโยบาย retry)
 *
 * กติกาเหล็ก #7: push ต้องผ่านคิว + กันส่งซ้ำด้วย `message_logs` (โควตา LINE มีจำกัด)
 * แยกไฟล์ pure เพื่อให้เทสต์ได้โดยไม่ต้องมี Redis/LINE keys
 */

import type { OrderStatus } from '@aroihoh/shared';

export type NotifyKind = 'order_confirm' | 'status_push';

/**
 * dedupeKey — unique ใน message_logs (กันแถวซ้ำที่ระดับ DB ไม่ใช่แค่ระดับแอป)
 * ใบยืนยัน: 1 ใบต่อ 1 ออเดอร์  ·  แจ้งสถานะ: 1 ครั้งต่อ (ออเดอร์, สถานะ)
 * → กดเปลี่ยนสถานะไปกลับ confirmed→preparing→confirmed จะไม่ push ซ้ำ
 */
export function buildDedupeKey(kind: NotifyKind, orderId: string, status?: OrderStatus): string {
  return kind === 'order_confirm' ? `confirm:${orderId}` : `status:${orderId}:${status}`;
}

/** แกะ dedupeKey กลับ (ใช้ตอน debug/รายงาน) */
export function parseDedupeKey(key: string): { kind: NotifyKind; orderId: string; status?: string } | null {
  const [prefix, orderId, status] = key.split(':');
  if (prefix === 'confirm' && orderId) return { kind: 'order_confirm', orderId };
  if (prefix === 'status' && orderId && status) return { kind: 'status_push', orderId, status };
  return null;
}

/**
 * ควร retry ไหมเมื่อ LINE ตอบ status นี้
 *  - 429 (เกิน rate limit) / 5xx (ฝั่ง LINE พัง) → retry ได้
 *  - 4xx อื่น (token ผิด, userId ไม่ถูก, payload พัง) → retry ไปก็เหมือนเดิม เปลืองโควตา
 */
export function isRetryableStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

/** หน่วงแบบ exponential + เพดาน — ป้องกันยิงรัวตอน LINE rate limit */
export function backoffMs(attempt: number, baseMs = 2000, maxMs = 60000): number {
  if (attempt < 1) return baseMs;
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

/** งานที่ส่งเข้าคิว — เก็บแค่ id ไม่เก็บ PII (PDPA #6: payload ค้างใน Redis) */
export interface NotifyJob {
  kind: NotifyKind;
  brandId: string;
  orderId: string;
  status?: OrderStatus;
  /** id ของแถว message_logs ที่จองไว้แล้ว — worker เอาไป mark sent/failed */
  messageLogId: string;
}

/** ตรวจ payload ก่อน process (กัน job เก่า/พังค้างในคิว) */
export function isValidJob(job: unknown): job is NotifyJob {
  if (!job || typeof job !== 'object') return false;
  const j = job as Record<string, unknown>;
  return (
    (j.kind === 'order_confirm' || j.kind === 'status_push') &&
    typeof j.brandId === 'string' &&
    typeof j.orderId === 'string' &&
    typeof j.messageLogId === 'string'
  );
}
