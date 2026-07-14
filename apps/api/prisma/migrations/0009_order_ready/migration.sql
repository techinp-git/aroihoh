-- US-41: เพิ่มสถานะ 'ready' (ครัวจัดเสร็จ รอไรเดอร์) แทรกก่อน 'delivering'
-- PG16 รองรับ ADD VALUE ใน transaction (ตั้งแต่ PG12)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ready' BEFORE 'delivering';
