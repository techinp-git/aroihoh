import { createHmac, timingSafeEqual } from 'crypto';

/**
 * ตรวจ x-line-signature (กติกาเหล็ก #3) — LINE เซ็น body ดิบด้วย HMAC-SHA256(channelSecret)
 * แล้วส่งมาเป็น Base64 ใน header. ต้องเทียบกับ body "ดิบ" (Buffer) ไม่ใช่ JSON ที่ parse แล้ว
 * ใช้ timingSafeEqual กัน timing attack
 */
export function verifyLineSignature(
  channelSecret: string,
  rawBody: Buffer | string,
  signature: string | undefined,
): boolean {
  if (!channelSecret || !signature) return false;
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', channelSecret).update(body).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false; // length ต่าง = ไม่ผ่าน (และกัน timingSafeEqual throw)
  return timingSafeEqual(a, b);
}
