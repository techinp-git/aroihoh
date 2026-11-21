-- US-22: สั่งล่วงหน้า D-1 — เวลาปิดรับ + รอบส่งของวันถัดไป
--
-- ทำไมอยู่ที่ "ครัว" ไม่ใช่ "แบรนด์": รอบผลิตและรอบรถเป็นสมบัติของครัว และคอนเซปต์
-- "หลายแบรนด์ ครัวเดียว" ต้องรวมออเดอร์ของทุกแบรนด์ที่ใช้ครัวเดียวกันเข้ารอบส่งเดียวกัน
-- (การรวมรอบคือเหตุผลเดียวที่ค่าส่งต่อจุดถูกลงพอให้โมเดลนี้ไม่ขาดทุน)

-- เวลาปิดรับออเดอร์ของวันถัดไป ตามเวลาไทย — เก็บเป็นค่าใน DB ไม่ใช่ค่าคงที่ในโค้ด
ALTER TABLE "kitchens" ADD COLUMN "preorderCutoff" TEXT NOT NULL DEFAULT '20:00';

CREATE TABLE "delivery_slots" (
    "id" TEXT NOT NULL,
    -- tenant key (กติกาเหล็ก #1) — ก๊อปจากครัว ครัวไม่ย้าย merchant
    "merchantId" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- "HH:MM" เวลาไทย — ช่วงเวลาที่บอกลูกค้าว่าของจะถึงในช่วงนี้
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_slots_kitchenId_idx" ON "delivery_slots"("kitchenId");
CREATE INDEX "delivery_slots_merchantId_idx" ON "delivery_slots"("merchantId");

ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_kitchenId_fkey"
    FOREIGN KEY ("kitchenId") REFERENCES "kitchens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- รอบเริ่มต้น 2 รอบให้ครัวที่มีอยู่แล้ว (เที่ยง/เย็น) — ตั้งใหม่/ปิดได้จากหลังร้าน
INSERT INTO "delivery_slots" ("id", "merchantId", "kitchenId", "name", "startTime", "endTime", "sortOrder")
SELECT gen_random_uuid()::text, k."merchantId", k."id", 'รอบเที่ยง', '11:00', '12:30', 1 FROM "kitchens" k
UNION ALL
SELECT gen_random_uuid()::text, k."merchantId", k."id", 'รอบเย็น', '17:00', '18:30', 2 FROM "kitchens" k;

-- ใบสรุปยอดผลิตกรองด้วยช่วง scheduledAt → index ให้ค้นเร็วแม้ออเดอร์สะสมเยอะ
CREATE INDEX "orders_brandId_scheduledAt_idx" ON "orders"("brandId", "scheduledAt");
