import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * SEC-1: เข้ารหัสความลับ at-rest (LINE channel secret/token) — AES-256-GCM
 * รูปแบบที่เก็บ: "v1:<iv b64>:<authTag b64>:<ciphertext b64>"
 *
 * คีย์: env ENCRYPTION_KEY (ยาวเท่าไรก็ได้ → hash เป็น 32 ไบต์) — prod ต้องตั้ง (สุ่ม `openssl rand -hex 32`)
 * ไม่มีคีย์ (dev/CI) = passthrough (เก็บ plaintext) + backward-compat: ค่าเดิมที่เก็บ plaintext อ่านออกได้เสมอ
 */
const PREFIX = 'v1:';

function keyBuf(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash('sha256').update(raw).digest(); // 32 bytes เสมอ
}

export function encryptSecret(plain: string): string {
  const k = keyBuf();
  if (!k) return plain; // ไม่มีคีย์ = passthrough (prod ต้องตั้ง ENCRYPTION_KEY)
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext (ค่าเดิมก่อนเปิด encryption)
  const k = keyBuf();
  if (!k) return null; // เข้ารหัสไว้แต่ไม่มีคีย์ → อ่านไม่ได้ (กันหลุดถ้าคีย์หาย)
  const [, ivB, tagB, ctB] = stored.split(':');
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
}

export function isEncrypted(stored: string | null): boolean {
  return !!stored && stored.startsWith(PREFIX);
}

/** เตือนตอน boot ถ้า prod แต่ไม่ตั้งคีย์ (secret จะถูกเก็บ plaintext) */
export function encryptionKeyConfigured(): boolean {
  return !!process.env.ENCRYPTION_KEY;
}
