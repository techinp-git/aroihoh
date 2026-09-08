/**
 * US-50: กติกาแต้ม — pure logic ไม่แตะ DB/Nest
 *
 * แหล่งความจริงของยอดแต้มคือ ledger (loyalty_transactions) ส่วน customers.pointsBalance
 * เป็น cache ที่ต้องอัปเดตใน transaction เดียวกันเสมอ — invariant คือสองอย่างนี้ต้องเท่ากัน
 * และยอดห้ามติดลบ (บังคับจริงที่ DB ด้วย conditional update ตอนตัดแต้ม)
 */

/** อายุคูปองแลกแต้ม — สั้นพอที่แคปหน้าจอไปใช้ทีหลังไม่ได้ แต่พอเดินไปเคาน์เตอร์ */
export const REDEMPTION_TTL_MS = 10 * 60 * 1000;

/**
 * ตัวอักษรของโค้ด QR — base32 ตัดตัวที่คนอ่านสับสน (0/O, 1/I/L) ออก
 * เพราะมีเส้นทางสำรองให้พิมพ์รหัสเองเมื่อกล้องสแกนไม่ติด
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 16; // ~78 bit — เดาไม่ได้ในทางปฏิบัติ
export const TOKEN_LENGTH = 24;

/** จำนวนหลักในโค้ดต่อกลุ่ม เวลาโชว์ให้คนอ่าน/พิมพ์ */
const GROUP = 4;

function randomFromAlphabet(length: number, bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** สร้างโค้ด QR — รับ bytes จากภายนอกเพื่อให้เทสต์ได้และไม่ผูกกับ crypto ของ runtime */
export function generateCode(bytes: Uint8Array): string {
  if (bytes.length < CODE_LENGTH) throw new Error('ต้องมี bytes อย่างน้อย CODE_LENGTH');
  return randomFromAlphabet(CODE_LENGTH, bytes);
}

/** token ของคูปอง — ยาวกว่าโค้ด QR เพราะเดาแล้วได้ของฟรีทันที */
export function generateToken(bytes: Uint8Array): string {
  if (bytes.length < TOKEN_LENGTH) throw new Error('ต้องมี bytes อย่างน้อย TOKEN_LENGTH');
  return randomFromAlphabet(TOKEN_LENGTH, bytes);
}

/**
 * ทำให้โค้ดที่ผู้ใช้พิมพ์/สแกนมาเทียบกับ DB ได้: ตัดช่องว่าง/ขีด, เป็นตัวใหญ่,
 * แล้วแปลงตัวที่คนมักพิมพ์สลับ (O→0 ไม่ได้เพราะ 0 ไม่อยู่ในชุด → ทำกลับทาง)
 */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    // 0 กับ 1 ไม่อยู่ในชุดตัวอักษร → แปลงกลับเป็นตัวที่ใกล้เคียงที่สุดที่ใช้จริง
    .replace(/0/g, 'Q')
    .replace(/1/g, 'J');
}

export function isValidCodeFormat(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** โชว์โค้ดเป็นกลุ่มละ 4 ให้คนอ่าน/พิมพ์ตามได้ไม่หลง */
export function formatCodeForHuman(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []).join('-');
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function redemptionExpiry(now: Date): Date {
  return new Date(now.getTime() + REDEMPTION_TTL_MS);
}

export function canRedeem(balance: number, pointsCost: number): boolean {
  return pointsCost > 0 && balance >= pointsCost;
}

export interface LedgerEntry {
  points: number;
}

/** ยอดแต้มที่ควรเป็นตาม ledger — ใช้ตรวจว่า cache (pointsBalance) ยังตรงอยู่ */
export function balanceFromLedger(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.points, 0);
}

export interface RewardLike {
  id: string;
  name: string;
  pointsCost: number;
}

/**
 * รางวัลชิ้นถัดไปที่จะโชว์ว่า "อีกกี่แต้มถึงแลกได้"
 *  - ปกติ = รางวัลถูกที่สุดที่ยังแลกไม่ได้ (มีเป้าให้เดินต่อ)
 *  - ถ้าแลกได้หมดแล้ว = รางวัลถูกที่สุด (โชว์ว่าแลกได้เลย อีก 0 แต้ม)
 *  - ไม่มีรางวัลเลย = null
 */
export function nextReward(balance: number, rewards: RewardLike[]): RewardLike | null {
  if (rewards.length === 0) return null;
  const byCost = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);
  return byCost.find((r) => r.pointsCost > balance) ?? byCost[0];
}

/** dedupe key ของ ledger — ให้ US-56 (แต้มจากออเดอร์) ผูกกับ orderId ได้โดยไม่ซ้ำ */
export function ledgerRef(
  type: 'qr_code' | 'redemption' | 'order' | 'admin',
  id: string,
): { refType: string; refId: string } {
  return { refType: type, refId: id };
}
