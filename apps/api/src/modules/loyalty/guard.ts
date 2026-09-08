/**
 * US-55: กติกากันโกงฝั่งสะสมแต้ม — pure logic ไม่แตะ DB/Nest
 *
 * สองชั้น:
 *  1) เพดานสแกนต่อวัน — กันพนักงานเก็บสติกเกอร์ที่ยังไม่แจกมาสแกนเข้าบัญชีตัวเองรวดเดียว
 *  2) จำกัดจำนวนครั้งที่สแกนพลาด — กันไล่เดารหัสด้วยสคริปต์
 */

/** ร้านส่วนใหญ่ไม่ต้องตั้งเอง — 5 ใบ/วันครอบคลุมคนซื้อหลายกล่องแล้ว */
export const DEFAULT_DAILY_EARN_CAP = 5;

/** สแกนพลาดได้กี่ครั้งใน 1 ชั่วโมงก่อนโดนกั้น */
export const MAX_FAILED_ATTEMPTS = 10;
export const FAILED_WINDOW_MS = 60 * 60 * 1000;

/** ผิดปกติเมื่อลูกค้า 1 คนสแกนเกินจำนวนนี้ภายในกรอบเวลาสั้น ๆ */
export const ANOMALY_SCANS = 4;
export const ANOMALY_WINDOW_MS = 10 * 60 * 1000;

export function resolveDailyCap(brandCap: number | null | undefined): number {
  return brandCap != null && brandCap > 0 ? brandCap : DEFAULT_DAILY_EARN_CAP;
}

/**
 * ต้นวันตามเวลาไทย (UTC+7) ในรูป Date ของ UTC
 * ใช้ตัดรอบ "ต่อวัน" ให้ตรงกับวันของร้าน ไม่ใช่วันของ UTC ที่ตัดตอนบ่ายโมงบ้านเรา
 */
export function bangkokDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 7 * 60 * 60 * 1000);
}

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย — ใช้จัดกลุ่มในรายงาน */
export function bangkokDateKey(at: Date): string {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** เอาเฉพาะครั้งที่ยังอยู่ในกรอบเวลา (เรียกก่อนนับเสมอ ไม่งั้น Map โตไม่หยุด) */
export function pruneAttempts(attempts: number[], now: number, windowMs = FAILED_WINDOW_MS): number[] {
  return attempts.filter((t) => now - t < windowMs);
}

export function isThrottled(
  attempts: number[],
  now: number,
  max = MAX_FAILED_ATTEMPTS,
  windowMs = FAILED_WINDOW_MS,
): boolean {
  return pruneAttempts(attempts, now, windowMs).length >= max;
}

export interface ScanEvent {
  customerId: string;
  at: Date;
}
export interface Anomaly {
  customerId: string;
  scans: number;
  windowMinutes: number;
  firstAt: Date;
  lastAt: Date;
}

/**
 * ลูกค้าคนไหนสแกนรัวผิดปกติ — sliding window ต่อคน
 * คืนช่วงที่หนาแน่นที่สุดของแต่ละคน (คนละ 1 รายการ) เรียงจากถี่สุด
 */
export function detectAnomalies(
  scans: ScanEvent[],
  threshold = ANOMALY_SCANS,
  windowMs = ANOMALY_WINDOW_MS,
): Anomaly[] {
  const byCustomer = new Map<string, Date[]>();
  for (const s of scans) {
    const list = byCustomer.get(s.customerId) ?? [];
    list.push(s.at);
    byCustomer.set(s.customerId, list);
  }

  const out: Anomaly[] = [];
  for (const [customerId, times] of byCustomer) {
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    let best: Anomaly | null = null;
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      while (sorted[end].getTime() - sorted[start].getTime() > windowMs) start++;
      const count = end - start + 1;
      if (count >= threshold && (!best || count > best.scans)) {
        best = {
          customerId,
          scans: count,
          windowMinutes: Math.round(windowMs / 60000),
          firstAt: sorted[start],
          lastAt: sorted[end],
        };
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.scans - a.scans);
}

export interface LedgerRow {
  type: 'earn' | 'redeem' | 'adjust' | 'expire';
  points: number;
  createdAt: Date;
}
export interface DailyPoints {
  date: string;
  earned: number;
  redeemed: number;
}

/** สรุปแต้มเข้า-ออกรายวัน (เวลาไทย) — วันที่ไม่มีรายการจะไม่มีในผลลัพธ์ */
export function summarizeDaily(rows: LedgerRow[]): DailyPoints[] {
  const byDate = new Map<string, DailyPoints>();
  for (const r of rows) {
    const date = bangkokDateKey(r.createdAt);
    const cur = byDate.get(date) ?? { date, earned: 0, redeemed: 0 };
    if (r.points >= 0) cur.earned += r.points;
    else cur.redeemed += -r.points;
    byDate.set(date, cur);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * US-56: ออเดอร์นี้ได้กี่แต้ม
 *
 * ฐานคิดคือ "เงินค่าอาหารที่ลูกค้าจ่ายจริง" = subtotal − discount
 *  - ไม่รวมค่าส่ง เพราะเงินก้อนนั้นไปที่ไรเดอร์ ไม่ใช่รายได้ร้าน
 *  - หักส่วนลดออก เพราะส่วนลดที่มาจากการแลกแต้มอยู่แล้ว ไม่ควรวนกลับมาเป็นแต้มอีก
 * ปัดลงเสมอ · ไม่ได้ตั้งอัตรา (null/0) = ไม่ให้แต้ม
 */
export function pointsForOrder(
  subtotalSatang: number,
  discountSatang: number,
  bahtPerPoint: number | null | undefined,
): number {
  if (!bahtPerPoint || bahtPerPoint <= 0) return 0;
  const paidBaht = Math.max(0, subtotalSatang - discountSatang) / 100;
  return Math.floor(paidBaht / bahtPerPoint);
}
