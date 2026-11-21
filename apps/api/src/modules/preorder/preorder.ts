/**
 * US-22: สั่งล่วงหน้า D-1 — ตรรกะเวลาปิดรับ/รอบส่ง/เขตเวลา (pure ไม่แตะ DB/Nest)
 *
 * ทำไมฟีเจอร์นี้มีอยู่: กำไรต่อกล่อง ~16.60 บาท แต่ค่าส่งเดี่ยวหนึ่งจุด ~49.50 บาท
 * การสั่งล่วงหน้าคือสิ่งเดียวที่ทำให้มีหลายจุดส่งในรัศมีเดียวพร้อมกันให้รวมรอบได้
 * และทำให้ครัวผลิตตามยอดที่ปิดแล้ว (อาหารปรุงสำเร็จอยู่อุณหภูมิห้องได้ไม่เกิน 2 ชม.)
 *
 * ⚠️ เวลาทั้งไฟล์คิดด้วยเขตเวลาไทย (UTC+7 คงที่ ไม่มี DST) ไม่ใช่ UTC —
 * ถ้าคิดด้วย UTC รอบวันจะตัดตอนบ่ายโมงบ้านเรา และ "พรุ่งนี้" จะเพี้ยนทุกเย็น
 */

/** ชดเชยเขตเวลาไทย — ประเทศไทยไม่มี DST ค่านี้จึงคงที่ตลอดปี */
const TH_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ค่าเริ่มต้นที่ใช้ตอน provision ครัวใหม่ (ของจริงอยู่ใน DB — ดู migration 0023) */
export const DEFAULT_PREORDER_CUTOFF = '20:00';
export const DEFAULT_SLOTS: { name: string; startTime: string; endTime: string; sortOrder: number }[] = [
  { name: 'รอบเที่ยง', startTime: '11:00', endTime: '12:30', sortOrder: 1 },
  { name: 'รอบเย็น', startTime: '17:00', endTime: '18:30', sortOrder: 2 },
];

export interface SlotRow {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
}

// ───────────────────────────── เวลา/วันที่แบบไทย ─────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHMM(s: string): boolean {
  return HHMM_RE.test(s);
}

/** "HH:MM" → นาทีจากเที่ยงคืน (null = รูปแบบไม่ถูกต้อง) */
export function parseHHMM(s: string): number | null {
  if (!isValidHHMM(s)) return null;
  const [h, m] = s.split(':');
  return Number(h) * 60 + Number(m);
}

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย */
export function bangkokDateKey(at: Date): string {
  return new Date(at.getTime() + TH_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD ถูกต้องไหม (และเป็นวันที่ที่มีจริง) */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** เลื่อนวัน (ตามปฏิทินไทย) — ใช้หา "พรุ่งนี้"/"เมื่อวาน" */
export function addDaysToDateKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** instant จริง (UTC) ของ "วันที่ dateKey เวลา hhmm" ตามเวลาไทย */
export function bangkokInstant(dateKey: string, hhmm: string): Date {
  const mins = parseHHMM(hhmm);
  if (mins == null) throw new Error(`เวลาไม่ถูกต้อง: ${hhmm}`);
  const base = new Date(`${dateKey}T00:00:00.000Z`).getTime();
  return new Date(base + mins * 60_000 - TH_OFFSET_MS);
}

/** วันพรุ่งนี้ตามเวลาไทย */
export function nextBangkokDateKey(now: Date): string {
  return bangkokDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/**
 * instant ที่ปิดรับออเดอร์ของรอบส่งวัน serviceDate
 * = เวลา cutoff ของ "วันก่อนหน้า" (D-1) เช่น ส่งวันที่ 22 ปิดรับ 21 เวลา 20:00
 */
export function cutoffInstantFor(serviceDate: string, cutoff: string): Date {
  return bangkokInstant(addDaysToDateKey(serviceDate, -1), cutoff);
}

// ───────────────────────────── รอบส่งที่เลือกได้ ─────────────────────────────

export interface SlotAvailability {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  /** วันที่ของรอบส่ง (YYYY-MM-DD เวลาไทย) */
  serviceDate: string;
  startAt: string;
  endAt: string;
  /** ปิดรับเมื่อไร — ให้ LIFF นับถอยหลังด้วยนาฬิกาตัวเองได้ ไม่ต้องเดา */
  cutoffAt: string;
  /** ปิดรับแล้ว (กดเลือกไม่ได้) */
  closed: boolean;
  /** เหลืออีกกี่มิลลิวินาทีก่อนปิดรับ (0 = ปิดแล้ว) */
  msLeft: number;
}

/** เรียงรอบตาม sortOrder แล้วตามเวลาเริ่ม — รอบเช้าต้องมาก่อนรอบเย็นเสมอบนจอ */
function sortSlots(slots: SlotRow[]): SlotRow[] {
  return [...slots].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime),
  );
}

/**
 * รอบส่งของวัน serviceDate พร้อมสถานะปิดรับ ณ เวลา now
 * คิดเฉพาะรอบที่ isActive — รอบที่ปิดใช้งานไม่ควรโผล่ให้ลูกค้าเห็นเลย
 */
export function buildSlotAvailability(
  slots: SlotRow[],
  cutoff: string,
  now: Date,
  serviceDate: string = nextBangkokDateKey(now),
): SlotAvailability[] {
  const cutoffAt = cutoffInstantFor(serviceDate, cutoff);
  const closed = now.getTime() >= cutoffAt.getTime();
  return sortSlots(slots.filter((s) => s.isActive)).map((s) => ({
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    serviceDate,
    startAt: bangkokInstant(serviceDate, s.startTime).toISOString(),
    endAt: bangkokInstant(serviceDate, s.endTime).toISOString(),
    cutoffAt: cutoffAt.toISOString(),
    closed,
    msLeft: Math.max(0, cutoffAt.getTime() - now.getTime()),
  }));
}

export type PreorderRejectCode =
  | 'SLOT_NOT_FOUND' // ไม่มีรอบนี้ / ปิดใช้งาน / เป็นรอบของครัวอื่น
  | 'PREORDER_CUTOFF_PASSED'; // เลยเวลาปิดรับของวันนั้นแล้ว

export type PreorderResolution =
  | { ok: true; slot: SlotAvailability; scheduledAt: Date }
  | { ok: false; code: PreorderRejectCode; reason: string; cutoffAt?: string };

/**
 * ลูกค้าเลือกรอบ slotId ได้ไหม ณ เวลา now — **ตัวตัดสินฝั่ง server**
 * ผลที่ LIFF คำนวณไว้เป็นแค่ UX เหมือนการเช็คเขต (กติกาเหล็ก #5)
 *
 * เก็บ scheduledAt = เวลาเริ่มรอบ (ไม่ใช่เวลาที่กดสั่ง) เพื่อให้ใบสรุปยอดผลิต
 * จัดกลุ่มด้วยช่วงเวลาของรอบได้ตรง ๆ
 */
export function resolvePreorder(
  slots: SlotRow[],
  cutoff: string,
  slotId: string,
  now: Date,
): PreorderResolution {
  const serviceDate = nextBangkokDateKey(now);
  const available = buildSlotAvailability(slots, cutoff, now, serviceDate);
  const slot = available.find((s) => s.id === slotId);
  if (!slot) {
    return { ok: false, code: 'SLOT_NOT_FOUND', reason: 'ไม่พบรอบส่งนี้' };
  }
  if (slot.closed) {
    return {
      ok: false,
      code: 'PREORDER_CUTOFF_PASSED',
      reason: `ปิดรับออเดอร์ของ${slot.name}พรุ่งนี้แล้ว (ปิดรับ ${cutoff})`,
      cutoffAt: slot.cutoffAt,
    };
  }
  return { ok: true, slot, scheduledAt: new Date(slot.startAt) };
}

/** ตรวจค่าที่เจ้าของร้านกรอกตอนตั้งรอบส่ง — คืนข้อความบอกเหตุ (null = ผ่าน) */
export function validateSlotTimes(startTime: string, endTime: string): string | null {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  if (s == null) return 'เวลาเริ่มรอบไม่ถูกต้อง (HH:MM)';
  if (e == null) return 'เวลาสิ้นสุดรอบไม่ถูกต้อง (HH:MM)';
  // ไม่รองรับรอบข้ามเที่ยงคืน (เหมือนเวลาทำการ US-16) — ร้านอาหารกลางวันไม่มีเคสนี้
  if (s >= e) return 'เวลาเริ่มรอบต้องก่อนเวลาสิ้นสุด';
  return null;
}
