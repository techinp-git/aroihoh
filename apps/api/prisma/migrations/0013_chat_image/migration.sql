-- แชตเก็บรูปจากลูกค้าได้ (LINE image message)
-- เก็บแค่ชื่อไฟล์ใน MEDIA_DIR ไม่เก็บ binary ใน DB (ตัว DB จะบวมและ backup ช้า)
-- null = ข้อความปกติ (text) เหมือนเดิม → backward-compat แถวเก่าไม่ต้องแตะ
ALTER TABLE "chat_messages" ADD COLUMN "imagePath" TEXT;
