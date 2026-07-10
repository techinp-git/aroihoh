/**
 * Seed ข้อมูลตัวอย่างสำหรับ dev/UAT — แบรนด์ "ชิมชีวา One Price 60" ย่านอโศก
 * รัน: npm run prisma:seed -w apps/api (ต้องมี DB + migrate ก่อน)
 * idempotent: ใช้ upsert ด้วย key ที่คงที่
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// พิกัดครัวสมมติแถวอโศก
const KITCHEN = { lat: 13.7376, lng: 100.5602 };

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { slug: 'chimchiva' },
    update: {},
    create: { name: 'ชิมชีวา (เจน)', slug: 'chimchiva' },
  });

  const brand = await prisma.brand.upsert({
    where: { merchantId_slug: { merchantId: merchant.id, slug: 'one-price-60' } },
    update: {},
    create: {
      merchantId: merchant.id,
      name: 'ชิมชีวา One Price 60',
      slug: 'one-price-60',
      // ⚠️ ค่า LINE จริงมาจาก SETUP-1 — ใส่ placeholder ให้ auth flow ทำงานตอน dev
      lineChannelId: process.env.LINE_CHANNEL_ID || 'DEV_CHANNEL_ID',
    },
  });

  // ครัวเดียว ใช้ radius 5 กม.
  let kitchen = await prisma.kitchen.findFirst({
    where: { merchantId: merchant.id, name: 'ครัวกลางอโศก' },
  });
  if (!kitchen) {
    kitchen = await prisma.kitchen.create({
      data: {
        merchantId: merchant.id,
        name: 'ครัวกลางอโศก',
        lat: KITCHEN.lat,
        lng: KITCHEN.lng,
        zoneType: 'radius',
        maxDistanceKm: 5,
      },
    });
  }

  await prisma.brandKitchen.upsert({
    where: { brandId_kitchenId: { brandId: brand.id, kitchenId: kitchen.id } },
    update: {},
    create: { brandId: brand.id, kitchenId: kitchen.id },
  });

  // กฎค่าส่งแบบขั้นบันได
  const hasFee = await prisma.deliveryFeeRule.findFirst({ where: { kitchenId: kitchen.id } });
  if (!hasFee) {
    await prisma.deliveryFeeRule.create({
      data: {
        kitchenId: kitchen.id,
        type: 'tiered',
        params: {
          tiers: [
            { maxKm: 2, fee: 1500 },
            { maxKm: 5, fee: 3000 },
          ],
        },
      },
    });
  }

  // เมนู One Price 60 (ราคาเป็นสตางค์ = 6000)
  const cat = await prisma.menuCategory.upsert({
    where: { id: `${brand.id}-cat-rice` }, // deterministic id เพื่อ idempotent
    update: {},
    create: { id: `${brand.id}-cat-rice`, brandId: brand.id, name: 'ข้าวกล่อง 60.-', sortOrder: 1 },
  });

  const menu = ['กะเพราไก่ไข่ดาว', 'ผัดซีอิ๊วหมู', 'ข้าวหน้าไก่เทอริยากิ', 'แกงเขียวหวานไก่'];
  for (const name of menu) {
    await prisma.menuItem.upsert({
      where: { id: `${brand.id}-${name}` },
      update: {},
      create: { id: `${brand.id}-${name}`, brandId: brand.id, categoryId: cat.id, name, price: 6000 },
    });
  }

  // owner admin (US-29) — ล็อกอินหลังบ้านจริง
  const ownerEmail = process.env.ADMIN_SEED_EMAIL || 'owner@chimchiva.local';
  const ownerPass = process.env.ADMIN_SEED_PASSWORD || 'owner1234';
  await prisma.adminUser.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      merchantId: merchant.id,
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPass, 10),
      name: 'เจ้าของร้าน',
      role: 'owner',
    },
  });

  console.log('seed done:', {
    merchantId: merchant.id,
    brandId: brand.id,
    kitchenId: kitchen.id,
    ownerLogin: `${ownerEmail} / ${ownerPass}`,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
