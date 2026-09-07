-- US-58: สมุดที่อยู่ของลูกค้า (ปักได้หลายหมุด: บ้าน / ที่ทำงาน / อื่น ๆ)
--
-- เดิม addresses ถูกสร้างใหม่ทุกออเดอร์ (snapshot) และไม่มี tenant key
-- หลังจากนี้ตารางเดียวเก็บ 2 บทบาท แยกด้วย isSaved:
--   isSaved = false → snapshot ของออเดอร์ (พฤติกรรมเดิม แถวเก่าทั้งหมดเป็นแบบนี้)
--   isSaved = true  → หมุดในสมุดที่อยู่ที่ลูกค้าเลือกใช้ซ้ำได้ (สูงสุด 5 ต่อลูกค้า — บังคับใน service)
-- ออเดอร์ยังชี้ snapshot เสมอ ไม่ชี้หมุดในสมุด → แก้/ลบหมุดทีหลังไม่กระทบออเดอร์เก่าและใบไรเดอร์

-- 1) tenant key (กติกาเหล็ก #1: ทุกตาราง business ต้องมี brand_id)
--    Customer ผูกกับ 1 แบรนด์อยู่แล้ว (@@unique([brandId, lineUserId])) → backfill ได้ตรง ๆ
ALTER TABLE "addresses" ADD COLUMN "brandId" TEXT;
UPDATE "addresses" a SET "brandId" = c."brandId" FROM "customers" c WHERE a."customerId" = c."id";
-- customerId เป็น NOT NULL + FK อยู่แล้ว → ทุกแถวต้องได้ค่า ถ้าเหลือ NULL ให้ migration ล้มดังกว่าปล่อยผ่าน
ALTER TABLE "addresses" ALTER COLUMN "brandId" SET NOT NULL;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) สมุดที่อยู่
ALTER TABLE "addresses" ADD COLUMN "note" TEXT;                                  -- ชั้น/ห้อง/จุดสังเกต/ฝากไว้ที่ รปภ.
ALTER TABLE "addresses" ADD COLUMN "isSaved" BOOLEAN NOT NULL DEFAULT false;     -- false = snapshot ของออเดอร์
ALTER TABLE "addresses" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;   -- เลือกให้อัตโนมัติตอนเช็คเอาต์ (1 อันต่อลูกค้า)
ALTER TABLE "addresses" ADD COLUMN "deletedAt" TIMESTAMP(3);                     -- soft delete: ออเดอร์เก่ายังชี้แถวได้
ALTER TABLE "addresses" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "addresses_customerId_isSaved_idx" ON "addresses"("customerId", "isSaved");
CREATE INDEX "addresses_brandId_idx" ON "addresses"("brandId");
