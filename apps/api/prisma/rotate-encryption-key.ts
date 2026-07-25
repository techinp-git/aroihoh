/**
 * SEC-1 rotate: เปลี่ยน ENCRYPTION_KEY โดยไม่ต้องกรอก LINE creds ใหม่ + ไม่มี downtime
 *
 * อ่านค่าเดิม decrypt ด้วยคีย์เก่า → encrypt ด้วยคีย์ใหม่ → เขียนกลับ DB
 * self-contained (ก็อป AES-256-GCM มาไว้ในไฟล์) — กันปัญหา import path ตอนรันใน container
 *
 * รัน (ใน container ที่ยังถือคีย์เก่าใน env):
 *   OLD_ENCRYPTION_KEY="$ENCRYPTION_KEY" ENCRYPTION_KEY="<คีย์ใหม่>" \
 *     npx ts-node -O '{"module":"commonjs"}' prisma/rotate-encryption-key.ts
 *
 * แล้วค่อยอัปเดต .env.prod เป็นคีย์ใหม่ + restart API
 */
import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'v1:';
const keyBuf = (raw: string) => createHash('sha256').update(raw).digest();

function decrypt(stored: string | null, rawKey: string): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const [, ivB, tagB, ctB] = stored.split(':');
  const d = createDecipheriv('aes-256-gcm', keyBuf(rawKey), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
}

function encrypt(plain: string, rawKey: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyBuf(rawKey), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

async function main() {
  const OLD = process.env.OLD_ENCRYPTION_KEY;
  const NEW = process.env.ENCRYPTION_KEY;
  if (!OLD || !NEW) throw new Error('ต้องตั้งทั้ง OLD_ENCRYPTION_KEY และ ENCRYPTION_KEY');
  if (OLD === NEW) throw new Error('คีย์เก่ากับใหม่เหมือนกัน — ไม่ต้อง rotate');

  const prisma = new PrismaClient();
  const brands = await prisma.brand.findMany({
    where: { OR: [{ lineChannelSecretEnc: { not: null } }, { lineChannelTokenEnc: { not: null } }] },
    select: { id: true, name: true, lineChannelSecretEnc: true, lineChannelTokenEnc: true },
  });

  console.log(`พบ ${brands.length} แบรนด์ที่มี LINE creds`);
  let changed = 0;
  for (const b of brands) {
    const data: Record<string, string> = {};
    // decrypt ด้วยคีย์เก่า (รองรับทั้ง v1: และ legacy plaintext) → re-encrypt ด้วยคีย์ใหม่
    const s = decrypt(b.lineChannelSecretEnc, OLD);
    const t = decrypt(b.lineChannelTokenEnc, OLD);
    if (s !== null) data.lineChannelSecretEnc = encrypt(s, NEW);
    if (t !== null) data.lineChannelTokenEnc = encrypt(t, NEW);

    // ตรวจ round-trip ก่อนเขียน: ถอดคีย์ใหม่ต้องได้ค่าเดิมเป๊ะ (กันเขียนของพัง)
    if (data.lineChannelSecretEnc && decrypt(data.lineChannelSecretEnc, NEW) !== s)
      throw new Error(`round-trip secret พังที่แบรนด์ ${b.name}`);
    if (data.lineChannelTokenEnc && decrypt(data.lineChannelTokenEnc, NEW) !== t)
      throw new Error(`round-trip token พังที่แบรนด์ ${b.name}`);

    if (Object.keys(data).length) {
      await prisma.brand.update({ where: { id: b.id }, data });
      changed++;
      console.log(`  ✓ ${b.name} — re-encrypt แล้ว (secret:${!!data.lineChannelSecretEnc} token:${!!data.lineChannelTokenEnc})`);
    }
  }
  console.log(`เสร็จ: rotate ${changed}/${brands.length} แบรนด์`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('rotate ล้มเหลว:', e.message);
  process.exit(1);
});
