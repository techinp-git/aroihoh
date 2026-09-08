/**
 * PDPA: กติกาว่าข้อมูลไหนหมดอายุแล้ว — pure logic (เทสต์ได้โดยไม่ต้องมี DB)
 *
 * ระยะเวลาตาม `docs/pdpa/README.md` ข้อ 2 และต้องตรงกับที่ประกาศใน privacy-policy.md
 * ⚠️ แก้ตัวเลขที่นี่แล้วต้องแก้ในนโยบายที่เผยแพร่ด้วย ไม่งั้นบอกลูกค้าอย่างทำอีกอย่าง
 */

const MONTH = 30 * 24 * 60 * 60 * 1000;
const YEAR = 365 * 24 * 60 * 60 * 1000;

export const RETENTION = {
  /** บัญชีลูกค้า + ที่อยู่ — นับจากกิจกรรมล่าสุด (สั่ง/ทักแชต/แก้โปรไฟล์) */
  inactiveCustomerMs: 12 * MONTH,
  /** ข้อความและรูปในแชต — นับจากวันที่ของข้อความ */
  chatMs: 12 * MONTH,
  /** ประวัติการสั่ง — ยาวกว่าเพราะกฎหมายบัญชี/ภาษีให้เก็บหลักฐานการขาย */
  orderMs: 5 * YEAR,
} as const;

export function cutoffs(now: Date) {
  const t = now.getTime();
  return {
    inactiveCustomer: new Date(t - RETENTION.inactiveCustomerMs),
    chat: new Date(t - RETENTION.chatMs),
    order: new Date(t - RETENTION.orderMs),
  };
}

export interface CustomerActivity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  lastOrderAt?: Date | null;
  lastChatAt?: Date | null;
  /** ถูกลบ/ทำให้ไม่ระบุตัวตนไปแล้ว — ข้ามไป ไม่ต้องทำซ้ำ */
  anonymized: boolean;
}

/**
 * กิจกรรมล่าสุดของลูกค้า — ใช้ค่ามากที่สุดของทุกช่องทาง
 * รวม `updatedAt` ด้วย เพราะการแก้ที่อยู่หรือเบอร์ก็คือการใช้บริการอยู่
 * (ถ้านับแต่ออเดอร์ ลูกค้าที่เพิ่งอัปเดตที่อยู่เตรียมสั่งจะโดนลบทิ้ง)
 */
export function lastActivityAt(c: CustomerActivity): Date {
  const times = [c.createdAt, c.updatedAt, c.lastOrderAt, c.lastChatAt]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());
  return new Date(Math.max(...times));
}

export function isInactive(c: CustomerActivity, now: Date): boolean {
  if (c.anonymized) return false;
  return lastActivityAt(c).getTime() < cutoffs(now).inactiveCustomer.getTime();
}

/** ข้อความที่ใส่แทนข้อมูลระบุตัวตน — ใช้ค่าเดียวกับตอนลบตามคำขอ จะได้ค้นเจอง่าย */
export const ANONYMIZED_NAME = 'ลบตามนโยบายเก็บข้อมูล';

/** lineUserId หลังตัดการเชื่อมกับบัญชี LINE — ต้อง unique ต่อ brand จึงผูกกับ id */
export function detachedLineUserId(customerId: string): string {
  return `retention-${customerId}`;
}

export interface RetentionPlan {
  inactiveCustomers: string[];
  now: Date;
}

/** สรุปเป็นข้อความให้อ่านใน log/dry-run — ต้องบอกจำนวนทุกอย่างที่จะแตะ */
export function describePlan(counts: {
  customers: number;
  chats: number;
  chatImages: number;
  orders: number;
  pointsVoided: number;
}): string {
  return [
    `ลูกค้าที่จะทำให้ไม่ระบุตัวตน: ${counts.customers}`,
    `ข้อความแชตที่จะลบ: ${counts.chats} (มีรูป ${counts.chatImages})`,
    `ออเดอร์เก่าที่จะลบ: ${counts.orders}`,
    `แต้มที่จะถูกตัดเป็นหมดอายุ: ${counts.pointsVoided}`,
  ].join(' · ');
}
