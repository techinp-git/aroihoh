-- Rich Menu ตามกลุ่ม (audience) + default menu
-- audienceId = null → default menu (คนใหม่/ไม่เข้ากลุ่มไหน), มีได้แบรนด์ละ 1 (บังคับในโค้ด)

CREATE TABLE "rich_menus" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "zones" JSONB NOT NULL,
    "chatBarText" TEXT NOT NULL DEFAULT 'เมนู',
    "imagePath" TEXT,
    "lineRichMenuId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rich_menus_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rich_menus_brandId_idx" ON "rich_menus"("brandId");
CREATE INDEX "rich_menus_brandId_audienceId_idx" ON "rich_menus"("brandId", "audienceId");

ALTER TABLE "rich_menus" ADD CONSTRAINT "rich_menus_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Restrict: ลบ audience ที่ยังมี rich menu ผูกอยู่ไม่ได้ (กันเมนูกลุ่มกลายเป็น default เงียบ ๆ)
ALTER TABLE "rich_menus" ADD CONSTRAINT "rich_menus_audienceId_fkey"
    FOREIGN KEY ("audienceId") REFERENCES "audiences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- เมนูที่ผูกให้ลูกค้าล่าสุด (lineRichMenuId) — null = อยู่ default menu
ALTER TABLE "customers" ADD COLUMN "assignedRichMenuId" TEXT;
