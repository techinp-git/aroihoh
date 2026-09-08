-- PDPA: บันทึกความยินยอมรับข่าวสาร (PDPA มาตรา 19 — การตลาดทางตรงต้องขอก่อนส่ง)
--
-- เดิมระบบเป็น opt-out: ลูกค้าใหม่ทุกคนถือว่ายอมรับทันทีจนกว่าจะกดปฏิเสธ
-- หลังจากนี้ "ส่งข่าวสารได้" = มี marketingConsentAt และไม่ได้กดปฏิเสธ
--
-- ลูกค้าเดิมถูก backfill เป็น source='legacy' เพื่อ**ไม่ให้ reach ตกทันที**
-- (เจ้าของร้านค่อยส่งขอความยินยอมรอบเดียวแล้วเปลี่ยนเป็น 'liff' ทีหลัง — ดู docs/pdpa/README.md ทางเลือก ข.)

ALTER TABLE "customers" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
-- 'legacy' = ยกมาจากระบบ opt-out เดิม · 'liff' = ลูกค้ากดยอมรับเอง · 'admin' = แอดมินตั้งให้
ALTER TABLE "customers" ADD COLUMN "marketingConsentSource" TEXT;

-- ผู้ที่ยังไม่ได้ปฏิเสธ = ถือว่ายินยอมแบบ legacy ตั้งแต่วันที่สมัคร
UPDATE "customers"
SET "marketingConsentAt" = "createdAt", "marketingConsentSource" = 'legacy'
WHERE "marketingOptedOut" = false;

-- รับทราบนโยบายความเป็นส่วนตัว (คนละเรื่องกับความยินยอมการตลาด)
ALTER TABLE "customers" ADD COLUMN "policyAcceptedVersion" TEXT;
ALTER TABLE "customers" ADD COLUMN "policyAcceptedAt" TIMESTAMP(3);

CREATE INDEX "customers_brandId_marketingConsentSource_idx"
  ON "customers"("brandId", "marketingConsentSource");
