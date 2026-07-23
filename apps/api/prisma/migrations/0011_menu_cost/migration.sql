-- US-19: ต้นทุนต่อเมนู + ค่าใช้จ่ายคงที่ต่อวัน → คำนวณมาร์จิ้น/กล่อง + จุดคุ้มทุนรายวัน
-- เงินเป็นสตางค์ (Int) เสมอ ตาม convention

-- ต้นทุนวัตถุดิบต่อจาน/กล่อง (null = ยังไม่ได้กรอก → รายงานจะบอกว่าข้อมูลไม่ครบ)
ALTER TABLE "menu_items" ADD COLUMN "costPrice" INTEGER;

-- snapshot ต้นทุน ณ เวลาที่สั่ง (เหมือน nameSnapshot/unitPrice)
-- แก้ต้นทุนเมนูทีหลังต้องไม่ทำให้รายงานย้อนหลังเปลี่ยน
ALTER TABLE "order_items" ADD COLUMN "unitCost" INTEGER;

-- ค่าใช้จ่ายคงที่ต่อวันของแบรนด์ (ค่าเช่า/คน/การตลาด เฉลี่ยต่อวัน) — ใช้หาจุดคุ้มทุน
ALTER TABLE "brands" ADD COLUMN "fixedCostDaily" INTEGER;
