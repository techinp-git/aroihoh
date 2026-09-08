/**
 * PDPA: ลบ/ทำให้ข้อมูลไม่ระบุตัวตนตามระยะเวลาที่ประกาศไว้ในนโยบาย
 *
 * ระยะเวลาอยู่ใน src/modules/pdpa/retention.ts (12 เดือน / 12 เดือน / 5 ปี)
 * ⚠️ ต้องตรงกับที่เขียนใน docs/pdpa/privacy-policy.md เสมอ
 *
 * รัน (ในคอนเทนเนอร์ api — ใช้ไฟล์ที่ build แล้ว ไม่ต้องมี ts-node):
 *   ดูก่อนว่าจะแตะอะไร (ไม่แก้อะไรเลย):
 *     node dist/modules/pdpa/retention.cli.js
 *   ลบจริง:
 *     node dist/modules/pdpa/retention.cli.js --apply
 *
 * ค่าเริ่มต้นคือ dry-run เสมอ — สคริปต์นี้ลบข้อมูลลูกค้าจริง ต้องตั้งใจถึงจะทำงาน
 *
 * ⚠️ อยู่ใน src/ ไม่ใช่ prisma/ โดยตั้งใจ — image ของ prod copy มาแค่ `dist`
 * สคริปต์ใน prisma/ ที่ import จาก src/ จะพังตอนรันในคอนเทนเนอร์ (เคยเจอกับ rotate-encryption-key)
 */
import { PrismaClient } from '@prisma/client';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { ANONYMIZED_NAME, cutoffs, describePlan, detachedLineUserId } from './retention';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const now = new Date();
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

/** ลบไฟล์รูปแชตที่ไม่มีแถวอ้างถึงแล้ว — เก็บกวาดดิสก์ ไม่ให้รูปลูกค้าค้างหลังลบข้อความ */
async function deleteOrphanImages(names: string[]) {
  const dir = process.env.MEDIA_DIR;
  if (!dir || names.length === 0) return 0;
  let removed = 0;
  const existing = new Set(await readdir(dir).catch(() => [] as string[]));
  for (const n of names) {
    if (!existing.has(n)) continue;
    await unlink(join(dir, n)).then(() => { removed++; }).catch(() => undefined);
  }
  return removed;
}

async function main() {
  const cut = cutoffs(now);
  log(`โหมด: ${APPLY ? 'ลบจริง (--apply)' : 'ดูอย่างเดียว (dry-run)'}`);
  log(`เส้นตาย — บัญชี/แชต: ${cut.inactiveCustomer.toISOString()} · ออเดอร์: ${cut.order.toISOString()}`);

  // ── 1) ข้อความแชตเก่ากว่ากำหนด ──
  const oldChats = await prisma.chatMessage.findMany({
    where: { createdAt: { lt: cut.chat } },
    select: { id: true, imagePath: true },
  });
  const chatImages = oldChats.map((c) => c.imagePath).filter((p): p is string => !!p);

  // ── 2) ลูกค้าที่เงียบเกินกำหนด ──
  // ใช้ค่ามากที่สุดของ updatedAt / ออเดอร์ล่าสุด / แชตล่าสุด — คิดใน SQL เพื่อไม่ต้องดึงทั้งตาราง
  const inactive = await prisma.$queryRaw<{ id: string; pointsBalance: number }[]>`
    SELECT c.id, c."pointsBalance"
    FROM customers c
    WHERE c."lineUserId" NOT LIKE 'retention-%'
      AND c."lineUserId" NOT LIKE 'deleted-%'
      AND GREATEST(
            c."updatedAt",
            COALESCE((SELECT max(o."createdAt") FROM orders o WHERE o."customerId" = c.id), c."createdAt"),
            COALESCE((SELECT max(m."createdAt") FROM chat_messages m WHERE m."customerId" = c.id), c."createdAt")
          ) < ${cut.inactiveCustomer}
  `;
  const pointsVoided = inactive.reduce((a, c) => a + c.pointsBalance, 0);

  // ── 3) ออเดอร์เก่ากว่ากำหนดทางบัญชี ──
  const oldOrders = await prisma.order.findMany({
    where: { createdAt: { lt: cut.order } },
    select: { id: true, addressId: true },
  });

  log(
    describePlan({
      customers: inactive.length,
      chats: oldChats.length,
      chatImages: chatImages.length,
      orders: oldOrders.length,
      pointsVoided,
    }),
  );

  if (!APPLY) {
    log('dry-run — ยังไม่แก้อะไร ใส่ --apply เพื่อทำจริง');
    return;
  }

  // ── ลบจริง ──
  if (oldChats.length) {
    await prisma.chatMessage.deleteMany({ where: { id: { in: oldChats.map((c) => c.id) } } });
    const removed = await deleteOrphanImages(chatImages);
    log(`ลบข้อความแชต ${oldChats.length} · ลบไฟล์รูป ${removed}`);
  }

  for (const c of inactive) {
    // ทีละคนใน transaction เดียว — คนหนึ่งพลาดไม่ควรทำให้ทั้งรอบล้ม
    await prisma
      .$transaction(async (tx) => {
        // แต้มที่เหลือถือว่าหมดอายุพร้อมบัญชี — ลง ledger เป็น 'expire'
        // เพื่อให้ pointsBalance ยังเท่ากับผลรวม ledger เสมอ (invariant ของ EP-14)
        if (c.pointsBalance > 0) {
          const brand = await tx.customer.findUnique({
            where: { id: c.id },
            select: { brandId: true },
          });
          if (brand) {
            await tx.loyaltyTransaction.create({
              data: {
                brandId: brand.brandId,
                customerId: c.id,
                type: 'expire',
                points: -c.pointsBalance,
                note: 'แต้มหมดอายุพร้อมการลบข้อมูลตามนโยบาย',
                refType: 'admin',
                refId: 'retention-job',
              },
            });
          }
        }
        // ที่อยู่ที่ไม่ได้ผูกกับออเดอร์ = ลบทิ้งได้ · ที่ผูกอยู่ = ล้างเนื้อหาแต่คงแถวไว้
        await tx.$executeRaw`
          DELETE FROM addresses a
          WHERE a."customerId" = ${c.id}
            AND NOT EXISTS (SELECT 1 FROM orders o WHERE o."addressId" = a.id)
        `;
        await tx.address.updateMany({
          where: { customerId: c.id },
          data: { detail: ANONYMIZED_NAME, note: null },
        });
        await tx.customer.update({
          where: { id: c.id },
          data: {
            displayName: ANONYMIZED_NAME,
            pictureUrl: null,
            phoneEnc: null,
            tags: [],
            pointsBalance: 0,
            marketingOptedOut: true,
            marketingConsentAt: null,
            marketingConsentSource: null,
            lineUserId: detachedLineUserId(c.id),
          },
        });
      })
      .catch((e) => log(`⚠️ ข้ามลูกค้า ${c.id}: ${(e as Error).message}`));
  }
  if (inactive.length) log(`ทำให้ไม่ระบุตัวตน ${inactive.length} ราย · ตัดแต้มหมดอายุรวม ${pointsVoided}`);

  for (const o of oldOrders) {
    await prisma
      .$transaction(async (tx) => {
        await tx.orderItem.deleteMany({ where: { orderId: o.id } });
        await tx.payment.deleteMany({ where: { orderId: o.id } });
        await tx.order.delete({ where: { id: o.id } });
        if (o.addressId) {
          await tx.address.deleteMany({ where: { id: o.addressId, isSaved: false } });
        }
      })
      .catch((e) => log(`⚠️ ข้ามออเดอร์ ${o.id}: ${(e as Error).message}`));
  }
  if (oldOrders.length) log(`ลบออเดอร์เก่า ${oldOrders.length}`);

  log('เสร็จ');
}

main()
  .catch((e) => {
    console.error('pdpa-retention ล้มเหลว:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
