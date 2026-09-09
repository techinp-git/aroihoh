-- US-61: ผูกบัญชี LINE ของพนักงานกับบัญชีแอดมิน (โหมดพนักงานใน LIFF)
-- คีย์เป็น (lineUserId, brandId): LINE userId ออกต่อ Login channel → คนละแบรนด์ได้คนละเลข
-- และถ้าสองแบรนด์ใช้ Login channel เดียวกัน คนเดียวก็ยังผูกได้ทั้งสองแบรนด์

CREATE TABLE "admin_line_links" (
    "lineUserId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "admin_line_links_pkey" PRIMARY KEY ("lineUserId", "brandId")
);

CREATE INDEX "admin_line_links_adminUserId_idx" ON "admin_line_links"("adminUserId");
CREATE INDEX "admin_line_links_brandId_idx" ON "admin_line_links"("brandId");

-- Cascade: ลบบัญชีแอดมิน = การผูก LINE ต้องหายตาม ไม่งั้นเหลือทางเข้าที่ไม่มีเจ้าของ
ALTER TABLE "admin_line_links" ADD CONSTRAINT "admin_line_links_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_line_links" ADD CONSTRAINT "admin_line_links_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
