-- US-07: เปิด/ปิดรับ COD ต่อแบรนด์
ALTER TABLE "brands" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT true;
