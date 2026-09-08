/**
 * PDPA มาตรา 19 — ส่งการตลาดทางตรงได้ต่อเมื่อได้รับความยินยอมก่อน
 *
 * แหล่งความจริงเดียวของคำถาม "ส่งข่าวสารหาคนนี้ได้ไหม" — ทุกที่ที่หาผู้รับ broadcast
 * ต้องเรียกฟังก์ชันนี้ ห้ามเช็ค marketingOptedOut ตรง ๆ เพราะไม่ครบเงื่อนไข
 *
 * เงื่อนไขมี 2 ชั้น และต้องผ่านทั้งคู่:
 *  1. เคยยินยอม (marketingConsentAt ไม่เป็น null)
 *  2. ยังไม่ได้ถอนความยินยอม (marketingOptedOut = false)
 * การถอนต้องชนะเสมอ แม้จะเคยยินยอมมาก่อน
 */
export interface MarketingConsentState {
  marketingOptedOut: boolean;
  marketingConsentAt?: Date | string | null;
}

export function canReceiveMarketing(c: MarketingConsentState): boolean {
  if (c.marketingOptedOut) return false;
  return c.marketingConsentAt != null;
}

/** แหล่งที่มาของความยินยอม — 'legacy' คือคนที่ยกมาจากระบบ opt-out เดิม ยังไม่เคยถูกถามจริง */
export type ConsentSource = 'legacy' | 'liff' | 'admin';

/** ควรถามขอความยินยอมคนนี้ไหม (ยังไม่เคยยินยอม หรือยินยอมแบบ legacy ที่ยังไม่เคยถูกถามจริง) */
export function shouldAskConsent(
  c: MarketingConsentState & { marketingConsentSource?: string | null },
): boolean {
  if (c.marketingOptedOut) return false; // ปฏิเสธไปแล้ว อย่าตื๊อ
  return c.marketingConsentAt == null || c.marketingConsentSource === 'legacy';
}
