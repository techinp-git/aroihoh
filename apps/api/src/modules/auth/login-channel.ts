/**
 * หา "LINE Login channel ID" ที่ต้องใช้ verify ID token จาก LIFF
 *
 * LINE แยก channel เป็นคนละตัวและคนละเลข:
 *   - Messaging API channel → ใช้ส่ง/รับข้อความ (เก็บที่ `lineChannelId` + secret/token)
 *   - LINE Login channel     → เป็นเจ้าของ LIFF app และเป็นผู้ออก ID token
 *
 * ID token ที่ `liff.getIDToken()` คืนมามี `aud` = **Login channel** เสมอ
 * เอา Messaging channel ID ไปยิง /oauth2/v2.1/verify = LINE ตอบ 400 ลูกค้าล็อกอินไม่ผ่าน
 *
 * ลำดับที่ใช้:
 *   1. `lineLoginChannelId` ที่ owner กรอกเอง (ชัดเจนที่สุด ใช้ก่อน)
 *   2. เลขหน้า LIFF ID — รูปแบบ LIFF ID คือ `<loginChannelId>-<suffix>` เดาได้ตรงและไม่ต้องกรอกซ้ำ
 *   3. `lineChannelId` — ของเดิม เผื่อ owner กรอก Login channel ไว้ในช่องนั้นอยู่แล้ว
 */
export interface LoginChannelSource {
  lineLoginChannelId?: string | null;
  liffId?: string | null;
  lineChannelId?: string | null;
}

/** เลขหน้า LIFF ID = Login channel ID (ต้องเป็นตัวเลขล้วน ไม่งั้นถือว่าเดาไม่ได้) */
export function loginChannelIdFromLiffId(liffId?: string | null): string | null {
  const prefix = (liffId ?? '').trim().split('-')[0];
  return /^\d+$/.test(prefix) ? prefix : null;
}

export function resolveLoginChannelId(b: LoginChannelSource): string | null {
  const explicit = (b.lineLoginChannelId ?? '').trim();
  if (explicit) return explicit;

  const fromLiff = loginChannelIdFromLiffId(b.liffId);
  if (fromLiff) return fromLiff;

  return (b.lineChannelId ?? '').trim() || null;
}
