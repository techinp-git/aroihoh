/**
 * US-58: กติกาสมุดที่อยู่ — pure logic ไม่แตะ DB/Nest (unit test ได้ตรง ๆ)
 * เงินและระยะทางไม่เกี่ยวที่นี่ ที่นี่ดูแค่ "หมุดไหนอยู่ในสมุด อันไหน default ป้ายชื่อหน้าตายังไง"
 */

/** เพดานหมุดต่อลูกค้า — กัน abuse และให้ลิสต์ในโปรไฟล์สั้นพอที่จะสแกนด้วยตา */
export const MAX_SAVED_ADDRESSES = 5;

/** ความยาวสูงสุดของป้าย (เกินนี้ UI ตัดคำ ลิสต์เละ) */
export const MAX_LABEL_LENGTH = 30;

export interface AddressBookEntry {
  id: string;
  isDefault: boolean;
  updatedAt: Date;
}

/** เพิ่มหมุดได้อีกไหม (นับเฉพาะหมุดที่ยังไม่ถูกลบ) */
export function canAddSavedAddress(currentCount: number): boolean {
  return currentCount < MAX_SAVED_ADDRESSES;
}

/**
 * ป้ายชื่อหมุด: ตัดช่องว่างหัวท้าย ยุบช่องว่างซ้ำ ตัดความยาว
 * ว่าง/มีแต่ช่องว่าง → null (UI จะโชว์ 📍 + ที่อยู่ย่อแทน)
 */
export function normalizeLabel(raw?: string | null): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_LABEL_LENGTH);
}

/** เรียงสมุดที่อยู่: หมุดหลักขึ้นก่อนเสมอ แล้วเรียงที่แก้ล่าสุดก่อน */
export function sortAddressBook<T extends AddressBookEntry>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

/**
 * ลบหมุดแล้วใครควรเป็นหมุดหลักต่อ
 *  - ลบหมุดที่ไม่ใช่หลัก → ไม่ต้องเปลี่ยนอะไร (null)
 *  - ลบหมุดหลัก → เลื่อนหมุดที่แก้ล่าสุดขึ้นมาแทน เพื่อให้เช็คเอาต์ยังมีตัวเลือกตั้งต้น
 *  - ไม่เหลือหมุดเลย → null
 */
export function nextDefaultAfterRemoval<T extends AddressBookEntry>(
  remaining: T[],
  removedWasDefault: boolean,
): string | null {
  if (!removedWasDefault || remaining.length === 0) return null;
  return sortAddressBook(remaining)[0].id;
}

/**
 * เบอร์โทรไทย → รูปแบบเดียว "0XXXXXXXXX"
 * รับได้ทั้ง 081-234-5678, +66 81 234 5678, 0812345678
 * ไม่เข้ารูปแบบ → null (ให้ caller ตอบ 400 ไม่ใช่เก็บขยะลง DB)
 */
export function normalizeThaiPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local =
    digits.startsWith('66') && digits.length === 11 ? '0' + digits.slice(2) : digits;
  const isMobile = /^0[689]\d{8}$/.test(local); // 06/08/09 + 8 หลัก
  const isLandline = /^0[2-7]\d{7}$/.test(local); // 02-07 + 7 หลัก
  return isMobile || isLandline ? local : null;
}

/** PDPA: หน้าโปรไฟล์โชว์แค่ 4 ตัวท้ายพอให้ลูกค้าจำได้ว่าเบอร์ไหน ไม่คืนเบอร์เต็ม */
export function phoneLast4(local: string | null): string | null {
  if (!local || local.length < 4) return null;
  return local.slice(-4);
}
