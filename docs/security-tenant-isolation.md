# SEC-2: Tenant Isolation Audit (merchant / brand)

สรุปผลตรวจ (audit ทุก admin endpoint) — **ผ่าน ไม่พบช่องโหว่ cross-tenant/IDOR**

## โมเดล isolation 2 ชั้น
- **merchant** = ขอบเขตลูกค้า SaaS แต่ละราย (Merchant → Brand → Kitchen)
- admin JWT ถือ `merchantId` + `brandIds` (owner/manager = ทุกแบรนด์ใน merchant · staff = เฉพาะที่ผูก `admin_brands`)

## กติกาที่บังคับใช้ (ตรวจครบทุก controller)
1. **ทุก endpoint ที่รับ `brandId`** → `assertBrandAccess(admin, brandId)` (เช็ค `admin.brandIds.includes(brandId)`) — กันเข้าถึงแบรนด์นอก merchant
2. **ทุก endpoint merchant-level** (kitchens, users, reports/merchant-daily, kitchen/orders, chat inbox) → ใช้ `admin.merchantId` / `admin.brandIds` ไม่รับ id ดิบจาก client
3. **ทุก mutate/read by `:id`** → service ทำ `findFirst({ id, brandId })` (หรือ `{ id, merchantId }`) **ก่อน** update/delete เสมอ = verify ownership ไม่ใช่เชื่อ `:id` ลอย ๆ (กัน IDOR)
4. **การผูก entity ข้ามตาราง** (brand↔kitchen, user↔brand) → `assertKitchensInMerchant` / `assertBrandsInMerchant` ตรวจว่า id อยู่ใน merchant เดียวกัน
5. **customer-facing** (orders) → scope ด้วย `customerId`/`brandId` จาก JWT (ไม่รับจาก body)

## จุดที่ตรวจ (service layer)
| module | mutate-by-id guard |
|---|---|
| orders.updateStatus | `findFirst({id, brandId})` ก่อน update |
| orders.getForCustomer | `findFirst({id, customerId})` (กันดูข้ามคน) |
| payments.markCodPaid | `findFirst({id, brandId})` |
| customers.setTags/setOptOut | `findFirst({id, brandId})` |
| content.update/remove | `assert(brandId, id)` = findFirst |
| audiences.update/remove | `get(brandId, id)` = findFirst |
| broadcasts.dispatch/detail | `findFirst({id, brandId})` · create ตรวจ content/audience ด้วย |
| menu.updateItem/delete | `assertItem(brandId, id)` |
| kitchens.update | `assertKitchen(merchantId, id)` |
| admin-users.update | `findFirst({id, merchantId})` + assertBrandsInMerchant |
| brands.update/cod | `assertBrandAccess(admin, id)` (id = brandId) |

## Public endpoints (ไม่มี auth) — ปลอดภัย
- `GET /menu/:brandId`, `GET /brand/:brandId` → คืนเฉพาะข้อมูลสาธารณะ (เมนู/ชื่อ/โลโก้/ธีม) ไม่มี PII · brandId เป็นค่าสาธารณะอยู่แล้ว (อยู่ใน LIFF URL)
- `POST /line/webhook/:brandId` → verify `x-line-signature` ด้วย secret ของแบรนด์นั้น (cross-tenant ปลอดภัย)

## Regression tests (e2e)
- customer JWT เข้า /admin → 401/403
- ลบเมนู/ผูกครัวข้าม brand/merchant → ปฏิเสธ
- **IDOR**: ส่ง brandId ที่ owner มีสิทธิ์ แต่ entity id ของอีกแบรนด์ (order status / mark-paid / customer tags) → 404/403

## หมายเหตุ (severity ต่ำ ยอมรับได้)
- `admin-users.create` เช็ค email ซ้ำแบบ global (`email` @unique ทั้งระบบ) → เผยว่า email ถูกใช้ที่ใดที่หนึ่ง (enumeration) แต่ไม่ leak ข้อมูล · เป็นผลจาก constraint unique เอง

## ก่อนขายจริง (นอกขอบเขต SEC-2 แต่เกี่ยวข้อง)
- `ALLOW_DEV_LOGIN` ต้องปิดใน prod (verified gated) · `ENCRYPTION_KEY` ต้องตั้ง (SEC-1) · secret แยกต่อ env
