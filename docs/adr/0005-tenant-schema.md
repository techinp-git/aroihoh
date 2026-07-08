# ADR-0005: Tenant schema — รวม merchants/stores กับ brands/kitchens เป็นชั้นเดียว

**สถานะ:** Accepted · **วันที่:** 2026-07-09
**อ้างอิง:** task "DOC: Prisma schema + ERD" (PRE-DEV), การ์ด KB "หลายแบรนด์ ครัวเดียว", แผนระบบ v2.0

## ปัญหา
มีสองโมเดล tenant ที่ขัดกันในเอกสาร:
- **แผน v2.0:** `merchants` (tenant = ร้านค้า) + `stores` (สาขา, เขตส่งผูกที่ store) — เหมาะเฟส C (SaaS ขายร้านนอก)
- **แท็บชิมชีวา:** `brands` (tenant = แบรนด์เสมือน) + `kitchens` (เขตส่งผูกที่ครัว) — เหมาะเฟส A–B (แบรนด์ตัวเองหลายแบรนด์ ครัวเดียว)

ถ้าเลือกผิดตอนนี้ ต้อง migrate ตอนขึ้นเฟส C ซึ่งแพง

## การตัดสินใจ
รวมเป็นลำดับชั้นเดียว **`Merchant` → `Brand` → `Kitchen`** ครอบคลุมทุกเฟส:

```
Merchant (นิติบุคคล/เจ้าของระบบ — tenant ระดับบิลลิ่ง)
   └── Brand (virtual brand: LINE OA/LIFF/Rich Menu ของตัวเอง)  ← tenant key ของ app
          └── (แชร์) Kitchen (จุดผลิต + เขตจัดส่ง + กฎค่าส่ง)
```

- **เฟส A** (ชิมชีวา): 1 Merchant, 1–N Brand, 1 Kitchen — ครัวเดียวหลายแบรนด์ผ่าน `BrandKitchen` (many-to-many)
- **เฟส C** (SaaS): แต่ละร้านนอก = 1 Merchant เพิ่มเข้ามา ไม่ต้องเปลี่ยน schema

## ผลที่ตามมา (กติกาที่ล็อก)
1. **tenant key ของ business data ทุกตาราง = `brandId`** (เมนู/ออเดอร์/ลูกค้า/payment/message log) — query ต้องกรอง `brandId` เสมอ
2. ตารางระดับเจ้าของใช้ `merchantId` (Kitchen, AdminUser)
3. **เขตจัดส่ง + ค่าส่งผูกที่ `Kitchen`** ไม่ใช่ Brand — ใช้ร่วมหลายแบรนด์ได้ตามคอนเซปต์ "ครัวเดียว"
4. ลูกค้าคนเดียวกันบน LINE = คนละ record ต่อ Brand (คนละ channel) → unique `(brandId, lineUserId)`
5. Kitchen เก็บทั้ง `lat/lng + maxDistanceKm` (สำหรับกลยุทธ์ radius) **และ** คอลัมน์ `deliveryZone geometry(Polygon,4326)` (สำหรับ PostGIS) — รองรับได้ทั้งสองทางเลือกของ **ADR-02 ที่ยังไม่เคาะ** (เก็บคอลัมน์ไว้ไม่ผูกมัดวิธี query)

## ทางเลือกที่ไม่เอา
- เลือก brands/kitchens ล้วน → เฟส C ต้องเพิ่มชั้น merchant ทีหลัง = migrate ตาราง fk ทั้งระบบ
- เลือก merchants/stores ล้วน → เฟส A ทำ virtual brand หลายแบรนด์ครัวเดียวไม่ได้ตรง ๆ
