# แผน: สะสมแต้มด้วย QR (EP-14 Loyalty)

สถานะ: **US-50/52/53/54 done** (8 ก.ย. 2026) — **วงจรครบแล้ว: สแกนได้แต้ม → แลกรางวัล → คนขายยืนยัน** · เหลือ US-51 (แผ่นพิมพ์ QR/CSV — จำเป็นก่อนใช้จริง) · US-55 (รายงาน+กันโกงเพิ่ม)

## 1. สรุปไอเดีย

| ฝั่ง | ทำอะไร | ใครทำ |
|---|---|---|
| **Earn** | admin สร้าง QR ไม่ซ้ำกัน (unique) แยกตามสินค้า + จำนวนแต้ม → พิมพ์ติดกล่อง/ใบเสร็จ → ลูกค้าสแกนด้วยกล้อง LINE → ได้แต้มเข้าบัญชีทันที | ลูกค้าอย่างเดียว **หน้าร้านไม่ต้องทำอะไร** |
| **Redeem** | ลูกค้าเปิด LIFF เลือกของรางวัล → ได้ QR คูปอง (อายุสั้น) → คนขายเปิดหน้า admin สแกน → ระบบตัดแต้ม + ยืนยัน | ลูกค้าเลือก / คนขายสแกนยืนยัน |

### ควรรวมกับ AroiHoh ไหม — **ควร** เหตุผล
- ตัวตนลูกค้า = `Customer(brandId, lineUserId)` ที่มีอยู่แล้ว ไม่ต้องสมัครสมาชิกใหม่ ไม่ต้องกรอกเบอร์
- กล้อง LINE สแกน `https://liff.line.me/<liffId>?e=<code>` แล้วเปิด LIFF ใน LINE ได้เลย (ไม่ต้องลงแอป) — LIFF มี pattern deep link `?orderId=` (US-08) อยู่แล้ว ทำซ้ำได้
- admin มี RBAC/AuditLog/assertBrandAccess/print.ts พร้อม → หน้าสแกน redeem = หน้าเดียวเพิ่มเข้าไป
- ต่อยอดได้ทันที: แต้มจากออเดอร์ delivery, ใช้แต้มเป็นส่วนลดตอนสั่ง, broadcast หาลูกค้าตามแต้ม (US-18 audience), Flex แจ้ง "ได้แต้มแล้ว"
- ข้อจำกัดที่ต้องแก้ก่อนใช้จริง: **LIFF ต้อง build ใหม่พร้อม `VITE_LIFF_ID`** (blocker เดิม) และ **PDPA pack** (แต้ม = ข้อมูลลูกค้า)

## 2. Flow

### 2.1 Earn (ลูกค้าสแกน)
```
admin สร้าง batch (สินค้า X, 10 แต้ม, 500 ใบ) → พิมพ์สติกเกอร์ QR
   ↓ batch สถานะ draft จนกดเปิดใช้ (active) — พิมพ์เสร็จ/แจกของแล้วค่อยเปิด
ลูกค้าสแกนด้วย LINE → เปิด LIFF ?e=<code> → login (POST /auth/line เดิม)
   ↓
POST /loyalty/earn { code }   (customer JWT)
   server: code มีจริง · brand ตรง · batch active · ยังไม่ถูกใช้ · ไม่หมดอายุ
   ทำใน transaction เดียว:
     UPDATE loyalty_qr_codes SET status='used', usedByCustomerId, usedAt
       WHERE code=? AND status='active'          ← atomic, count=0 = โดนใช้แล้ว
     INSERT loyalty_transactions (earn, +points, ref=code)
     UPDATE customers SET pointsBalance = pointsBalance + points
   ↓
LIFF โชว์ "ได้ 10 แต้ม! ยอดรวม 130" / "QR นี้ถูกใช้แล้ว" / "QR ไม่ถูกต้อง"
```

### 2.2 Redeem (คนขายสแกน)
```
ลูกค้า LIFF แท็บ "แต้มของฉัน" → เลือกรางวัล (ต้องมีแต้มพอ)
   ↓
POST /loyalty/redemptions { rewardId }   (customer JWT)
   server: ยกเลิก pending เดิมของลูกค้าคนนี้ (มีได้ทีละ 1 ใบ) → สร้างใบใหม่
           token สุ่ม ≥ 20 ตัว, expiresAt = now+10 นาที, pointsCost snapshot
   **ยังไม่ตัดแต้ม** (ตัดตอนคนขายยืนยัน)
   ↓
LIFF โชว์ QR ใหญ่ (เนื้อหา = token) + ชื่อรางวัล + นับถอยหลัง + รหัสตัวอักษรสำรอง
   ↓
คนขายเปิด admin หน้า "สแกนแลกแต้ม" (กล้องมือถือ/พิมพ์รหัส)
POST /admin/loyalty/redemptions/:token/confirm   (admin JWT, role ≥ staff)
   transaction: lock customer row → เช็ค balance ≥ pointsCost → เช็ค pending+ไม่หมดอายุ
     UPDATE redemption status='confirmed', confirmedByAdminId
     INSERT loyalty_transactions (redeem, -points)
     UPDATE customers pointsBalance -= points
     INSERT audit_logs
   ↓
admin โชว์ "✅ แลก ข้าวมันไก่ฟรี · ตัด 100 แต้ม · เหลือ 30" → คนขายส่งของ
LIFF poll สถานะใบ (5s เหมือน track) → เปลี่ยนเป็น "ใช้แล้ว"
```

ทำไมไม่ตัดแต้มตอนสร้างใบ (hold): ต้องมี job คืนแต้มเมื่อหมดอายุ ยุ่งกว่า — กติกา "pending ได้ทีละ 1 ใบ + เช็ค balance ตอน confirm" กัน double-spend ได้เท่ากัน โดยไม่ต้องมี job

## 3. Data model (migration `0014_loyalty`)

ทุกตารางมี `brandId` (กติกาเหล็ก #1) · แต้มเป็น integer

```prisma
model LoyaltyQrBatch {
  id          String   @id @default(uuid())
  brandId     String
  name        String            // "สติกเกอร์กล่องข้าวมันไก่ ล็อต ก.ย."
  menuItemId  String?           // ผูกสินค้า (optional — แต้มทั่วไปก็ได้)
  points      Int
  quantity    Int
  status      LoyaltyBatchStatus @default(draft) // draft | active | revoked
  expiresAt   DateTime?
  createdById String            // admin
  createdAt   DateTime @default(now())
  codes       LoyaltyQrCode[]
  @@index([brandId, status])
  @@map("loyalty_qr_batches")
}

model LoyaltyQrCode {
  id                String   @id @default(uuid())
  brandId           String
  batchId           String
  code              String   @unique   // base32 สุ่ม 16 ตัว (~80 bit) — ไม่มี 0/O/1/I
  points            Int                // snapshot จาก batch
  status            LoyaltyCodeStatus @default(active) // active | used | revoked
  usedByCustomerId  String?
  usedAt            DateTime?
  @@index([batchId, status])
  @@index([brandId, usedByCustomerId])
  @@map("loyalty_qr_codes")
}

model LoyaltyReward {
  id             String   @id @default(uuid())
  brandId        String
  name           String
  description    String?
  pointsCost     Int
  type           LoyaltyRewardType   // free_item | discount
  menuItemId     String?             // free_item
  discountAmount Int?                // discount (สตางค์)
  isActive       Boolean @default(true)
  sortOrder      Int     @default(0)
  @@index([brandId, isActive])
  @@map("loyalty_rewards")
}

model LoyaltyRedemption {
  id                 String   @id @default(uuid())
  brandId            String
  customerId         String
  rewardId           String
  rewardName         String            // snapshot
  pointsCost         Int               // snapshot
  token              String   @unique  // เนื้อหาใน QR คูปอง
  status             LoyaltyRedemptionStatus @default(pending) // pending | confirmed | expired | cancelled
  expiresAt          DateTime
  confirmedByAdminId String?
  confirmedAt        DateTime?
  orderId            String?           // เฟส 2: ใช้เป็นส่วนลดออเดอร์
  createdAt          DateTime @default(now())
  @@index([brandId, status])
  @@index([customerId, status])
  @@map("loyalty_redemptions")
}

model LoyaltyTransaction {          // ledger append-only — ห้าม update/delete
  id         String   @id @default(uuid())
  brandId    String
  customerId String
  type       LoyaltyTxType  // earn | redeem | adjust | expire
  points     Int            // มีเครื่องหมาย (+earn / -redeem)
  refType    String?        // 'qr_code' | 'redemption' | 'order' | 'admin'
  refId      String?
  note       String?
  createdAt  DateTime @default(now())
  @@index([customerId, createdAt])
  @@index([brandId, createdAt])
  @@map("loyalty_transactions")
}

// เพิ่มใน Customer
pointsBalance Int @default(0)   // cache ของ SUM(loyalty_transactions.points) — อัปเดตใน transaction เดียวกันเสมอ
```

Invariant ที่ต้อง unit test: `customers.pointsBalance == SUM(transactions.points)` เสมอ · balance ห้ามติดลบ

## 4. API

| method | path | guard | หมายเหตุ |
|---|---|---|---|
| POST | `/loyalty/earn` | customer JWT | body `{code}` → `{points, balance}` · 409 ใช้แล้ว · 404 ไม่มี/ยังไม่เปิด/หมดอายุ (ตอบเหมือนกัน ไม่บอกว่ามีอยู่จริง) |
| GET | `/loyalty/me` | customer JWT | balance + 20 รายการล่าสุด + pending redemption |
| GET | `/loyalty/rewards` | customer JWT | รางวัล active ของแบรนด์ |
| POST | `/loyalty/redemptions` | customer JWT | `{rewardId}` → `{token, expiresAt, ...}` · 422 แต้มไม่พอ |
| GET | `/loyalty/redemptions/:id` | customer JWT (เจ้าของ) | LIFF poll สถานะ |
| GET/POST | `/admin/loyalty/batches` | owner/manager | สร้าง = gen code ทั้งหมดใน transaction (500 ใบ ~ instant, createMany) |
| PATCH | `/admin/loyalty/batches/:id` | owner/manager | `{status: active\|revoked}` |
| GET | `/admin/loyalty/batches/:id/codes` | owner/manager | คืน code+points → admin render QR / CSV |
| CRUD | `/admin/loyalty/rewards` | owner/manager | |
| GET | `/admin/loyalty/redemptions/:token` | staff+ | preview ก่อนยืนยัน (ชื่อลูกค้า/รางวัล/แต้ม/หมดอายุ) |
| POST | `/admin/loyalty/redemptions/:token/confirm` | staff+ | ตัดแต้ม + audit |
| POST | `/admin/loyalty/customers/:id/adjust` | owner | `{points, note}` แก้มือ (ลง ledger type adjust) |
| GET | `/admin/loyalty/report` | owner/manager | earn/redeem ต่อวัน · ต่อ batch · ลูกค้า top · แจ้งเตือนผิดปกติ |

ทุก endpoint admin ที่รับ brandId → `assertBrandAccess` เหมือนเดิม · redeem confirm ไม่รับ brandId จาก client — เอาจาก redemption แล้วเช็คว่า admin มีสิทธิ์แบรนด์นั้น

## 5. UI

### LIFF (แท็บใหม่ "แต้ม")
- **หน้าแต้ม**: ยอดแต้มใหญ่ ๆ · รายการรางวัล (ปุ่ม "แลก" เทาถ้าแต้มไม่พอ) · ประวัติ
- **หน้าคูปอง**: QR ใหญ่ (lib `qrcode` render เป็น SVG ~15KB gz) · ชื่อรางวัล · นับถอยหลัง 10 นาที · รหัสตัวอักษรเผื่อสแกนไม่ติด · poll → "ใช้แล้ว ✅"
- **deep link `?e=<code>`**: boot → login → ยิง earn → หน้าผลลัพธ์ (สำเร็จ/ใช้แล้ว/ไม่ถูกต้อง) → ปุ่ม "ดูแต้ม"/"สั่งอาหาร" · pattern เดียวกับ `DEEP_LINK_ORDER_ID` ใน `liff/src/api.ts`

### Admin (หน้าใหม่ "สะสมแต้ม")
- แท็บ **QR สะสมแต้ม** (owner/manager): ตาราง batch · สร้าง (เลือกเมนู, แต้ม, จำนวน, วันหมดอายุ) · ปุ่ม 🖨️ พิมพ์แผ่นสติกเกอร์ (reuse `lib/print.ts` — grid label 40×40mm, QR + ชื่อสินค้า + แต้ม + เลขลำดับ) · ⬇ CSV (code, url) ส่งโรงพิมพ์ · เปิดใช้/ยกเลิก
- แท็บ **รางวัล** (owner/manager): CRUD
- แท็บ **สแกนแลกแต้ม** (staff/manager/owner — เมนูเดียวที่ staff เห็นในหน้านี้): กล้อง (`html5-qrcode` หรือ `BarcodeDetector` ถ้ามี, fallback พิมพ์รหัส) → preview → ปุ่มยืนยันใหญ่ → ผลลัพธ์ + beep (reuse `lib/beep.ts`)
- แท็บ **รายงาน** (owner/manager)
- หน้าลูกค้า (US-35 detail): เพิ่มการ์ดแต้ม + ประวัติ + ปุ่มแก้แต้ม (owner)

QR gen: ใช้ `qrcode` (npm, MIT, ไม่มี dependency) render ฝั่ง admin/LIFF — server ไม่ต้องทำรูป

## 6. ความปลอดภัย / กันโกง

| ความเสี่ยง | มาตรการ |
|---|---|
| ถ่ายรูป QR ไปแชร์ / สแกนก่อนซื้อ | **ใช้ได้ครั้งเดียว** (atomic update) · พิมพ์ไว้**ใต้ฝา/ด้านในกล่อง**หรือใบเสร็จ ไม่โชว์ด้านนอก · batch เป็น draft จนของถึงร้าน |
| เดา code | base32 สุ่ม 16 ตัว (~80 bit) · earn ผิด ≥ 10 ครั้ง/ชม. ต่อลูกค้า → 429 |
| ลูกค้าคนเดียวกวาดสแกนทั้งล็อต (พนักงานเอาสติกเกอร์มาสแกนเอง) | เพดานแต้ม/วัน ต่อลูกค้า (config ต่อแบรนด์, default 5 ใบ/วัน) · รายงานแจ้งเตือน "ลูกค้า 1 คนใช้ >N ใบจาก batch เดียวใน 10 นาที" · revoke batch ได้ |
| คูปองใช้ซ้ำ | token ใช้ครั้งเดียว · หมดอายุ 10 นาที · pending ได้ทีละ 1 ใบ · เช็ค balance ใน transaction ที่ lock แถวลูกค้า |
| พนักงานยืนยันมั่ว | ต้อง login admin · ลง `audit_logs` (ใครยืนยัน เมื่อไหร่) · รายงานต่อ admin |
| ข้ามแบรนด์ | brandId ทุกตาราง · code/redemption ผูกแบรนด์ · assertBrandAccess |
| PDPA | แต้ม/ประวัติ = ข้อมูลลูกค้า → ต้องมี privacy policy ก่อนเปิด (blocker เดิม) · ไม่ log lineUserId/ชื่อคู่กับ code ใน log ทั่วไป · ลบลูกค้า = ลบ ledger ด้วย |

## 7. แตกงาน (เสนอ)

| story | เนื้อหา | ประมาณ |
|---|---|---|
| US-50 ✅ | schema + migration 0014 · module `loyalty` · pure `ledger.ts` (apply earn/redeem, invariant, code generator, expiry) + unit tests · earn/redeem service (transaction) · e2e เพิ่ม: ใช้ซ้ำ=409, ข้ามแบรนด์=404, balance ไม่ติดลบ | 1 วัน |
| US-51 | admin: batch CRUD + gen code + แผ่นพิมพ์ QR + CSV + เปิดใช้/ยกเลิก | 1 วัน |
| US-52 ✅ | LIFF: deep link `?e=` → earn → หน้าผลลัพธ์ · แท็บแต้ม (balance/ประวัติ) | 0.5–1 วัน |
| US-53 ✅ | รางวัล CRUD (admin) + LIFF เลือกรางวัล → คูปอง QR + poll สถานะ | 1 วัน |
| US-54 ✅ | admin หน้าสแกน (กล้อง + พิมพ์รหัส) → preview → confirm + audit + beep | 0.5–1 วัน |
| US-55 | รายงาน + เพดาน/วัน + rate limit + แจ้งเตือนผิดปกติ + adjust แต้มมือ + การ์ดในหน้าลูกค้า | 0.5 วัน |
| US-56 (เฟส 2) | แต้มอัตโนมัติจากออเดอร์ delivery ตอน `completed` (X แต้ม/บาท) · Flex แจ้งได้แต้ม (ผ่านคิว notifications) | 0.5 วัน |
| US-57 (เฟส 2) | ใช้รางวัลเป็นส่วนลดตอนสั่งใน LIFF (`orders.discount` คิด server) · audience rule "แต้ม ≥ N" | 1 วัน |

รวมเฟส 1 (US-50–55) ≈ **5 วัน dev** · ลำดับทำ: 50 → 51 → 52 (ทดสอบ earn ปลายทางถึงปลายทางได้ก่อน) → 53 → 54 → 55

## 8. ต้องตัดสินใจก่อนเริ่ม (ห้ามเดา)

**ข้อ 6 เคาะแล้ว 8 ก.ย. 2026: แต้มแยกต่อแบรนด์** (ตามที่ผู้ใช้เคาะเรื่องที่อยู่ใน EP-15 และตาม ADR-07) — ลงใน migration 0016 แล้ว ทุกตารางมี `brandId` · อีก 5 ข้อยังค้าง แต่**ไม่บล็อก US-50** เพราะเป็นค่าที่ตั้งผ่านหน้าแอดมิน (ข้อ 1/4) หรือกระทบ US-51/54 (ข้อ 2/3/5)

1. **อัตราแต้ม** — 1 กล่อง = กี่แต้ม / รางวัลแรกใช้กี่แต้ม (เช่น 10 กล่อง = ฟรี 1)
2. **แต้มหมดอายุไหม** — ถ้าหมด (เช่น 12 เดือน) ต้องมี job + แจ้งลูกค้า → ขยับไปเฟส 2
3. **QR พิมพ์ที่ไหน** — สติกเกอร์ใต้ฝา (โรงพิมพ์, ต้อง CSV ล่วงหน้า) vs พิมพ์บนใบเสร็จ 80mm หน้าร้านทีละใบ (ใช้เครื่องพิมพ์ครัวที่มีอยู่ — โกงยากกว่า แต่หน้าร้านต้องกดพิมพ์ = ขัดโจทย์ "หน้าร้านไม่ต้องทำอะไร")
4. **รางวัลเป็นของฟรีหรือส่วนลดเงิน** — กระทบ type ใน `LoyaltyReward` และเฟส 2 (ส่วนลดออเดอร์)
5. **ใครสแกน redeem** — ให้ role `staff` พอ หรือเพิ่ม role `cashier`? (แนะนำ: staff พอ, กัน role บาน)
6. **หลายแบรนด์แต้มรวมกันไหม** — ตามที่ออกแบบ แต้มแยกต่อแบรนด์ (ADR-07 House of Brands) · ถ้าจะรวม ต้องย้ายไป merchant-level = แก้ tenant key ให้ตัดสินตอนนี้

## 9. ขึ้นก่อน launch (blocker เดิมที่ยังค้าง)
- [ ] LIFF build ใหม่พร้อม `VITE_LIFF_ID` บน prod (ไม่งั้นลูกค้าสแกนแล้วเข้าไม่ได้เลย)
- [ ] PDPA pack (privacy policy + consent) — แต้มเป็นข้อมูลลูกค้า
- [ ] ทดสอบสแกนจากกล้อง LINE จริง (Android/iOS) ว่าเปิด LIFF ได้ ไม่เด้งไป browser นอก

## 10. บันทึกตอนลง US-50 (8 ก.ย. 2026)
- **migration เป็น `0016_loyalty` ไม่ใช่ 0014** (0014 ถูกข้าม, 0015 เป็น saved addresses ของ EP-15 ที่ลงก่อน)
- จุดกันโกงที่ลงจริงและมี e2e คุม: โค้ดใช้ครั้งเดียวด้วย **conditional update** (`WHERE status='active'`) ไม่ใช่ SELECT-แล้ว-UPDATE · ล็อต `draft` สแกนไม่ได้ · โค้ดข้ามแบรนด์ 404 · ตัดแต้มด้วย **`WHERE pointsBalance >= cost`** → ยอดติดลบไม่ได้แม้ยิงพร้อมกัน · ยืนยันคูปองซ้ำ = 409 และ rollback ทั้งก้อน (ไม่ตัดแต้มสองรอบ)
- **ไม่ได้ใส่ CHECK constraint `pointsBalance >= 0`** ที่ DB เพราะ Prisma ไม่รู้จัก จะกลายเป็น drift ตอน `migrate dev` — ใช้ conditional update + e2e คุมแทน
- `normalizeCode` รับรหัสที่พิมพ์เองแบบมีขีด/ตัวเล็ก และแปลง O/I/L ที่คนมักพิมพ์สลับ (ชุดตัวอักษรตัด 0/O/1/I/L ออกตั้งแต่แรก)
- US-50 รวม endpoint แอดมินขั้นต่ำ (สร้างล็อต/เปิดใช้/ดึงโค้ด/สร้างรางวัล) ด้วย เพราะไม่มีสิ่งเหล่านี้ก็ทดสอบ earn/redeem ไม่ได้เลย — ส่วน UI (แผ่นพิมพ์ QR, CSV, หน้าสแกน, รายงาน) ยังเป็นของ US-51/54/55 ตามเดิม
- `/me/profile` คืน `loyalty` แล้ว → **แท็บ "แต้ม" ใน LIFF ติดขึ้นมาเองตามที่ US-59 ออกแบบไว้ ไม่ต้องแก้ LIFF เลย** (ยืนยันในเบราว์เซอร์แล้ว) · หน้าแลกรางวัล/คูปอง QR เต็มรูปแบบยังเป็น US-52/53

## 11. บันทึกตอนลง US-52 (8 ก.ย. 2026)
- deep link `?e=<code>` ทำงานเหมือน `?orderId=` (US-08): LINE ต่อ query ท้าย Endpoint URL ที่มี `?brandId=` อยู่แล้ว → ได้ครบทั้งคู่
- **ลบ `?e=` ออกจาก URL ด้วย `history.replaceState` ทันทีหลังยิง** ไม่งั้นลูกค้ารีเฟรชแล้วยิงซ้ำ เห็น "ใช้แล้ว" ทั้งที่เพิ่งได้แต้มไป
- แยกข้อความ 3 เคสให้ชัด เพราะทางออกของลูกค้าคนละเรื่อง: **409 ใช้แล้ว** (ให้ไปสแกนใบในกล่องใหม่) · **404 ใช้ไม่ได้** (อาจคนละร้าน/ยังไม่เปิด/หมดอายุ → ถามพนักงาน) · **error เชื่อมต่อ** (ลองใหม่ แต้มยังไม่ถูกใช้)
- โปรไฟล์ถูกโหลดก่อนรับแต้มในลำดับ boot → ต้องดึง `/me/profile` ใหม่หลังสแกนสำเร็จ ไม่งั้นการ์ดแต้มค้างยอดเก่า
- ทดสอบในเบราว์เซอร์ครบ 4 เคส: สำเร็จ (+10) · สแกนซ้ำ · รหัสมั่ว · **พิมพ์รหัสเองแบบตัวเล็ก+มีขีด** (`jwk6-h5q7-...`) ใช้ได้ตามที่ `normalizeCode` ออกแบบไว้
- ⚠️ **ยังไม่ได้ทดสอบจากกล้อง LINE จริงบนมือถือ** — ต้องมี LIFF ID บน prod ก่อน (blocker เดิม: build LIFF พร้อม `VITE_LIFF_ID`) ยังไม่ยืนยันว่ากล้อง LINE เปิด LIFF ได้โดยไม่เด้งไป browser นอก

## 12. บันทึกตอนลง US-53 + US-54 (8 ก.ย. 2026)
- **เปลี่ยน `TOKEN_LENGTH` 24 → 12** เพื่อให้ "รหัสสำรอง" ที่คนขายพิมพ์เอง = token เดียวกับใน QR ไม่ต้องมีสองค่าให้สับสน · 12 ตัวจากชุด 31 ตัว ≈ 59 bit + อายุ 10 นาที + ต้องยิงผ่าน endpoint ที่ล็อกอินแอดมิน → เดาสุ่มไม่คุ้ม · โชว์เป็น `XXXX-XXXX-XXXX`
- admin preview/confirm เรียก `normalizeCode` ก่อนค้น → คนขายพิมพ์ตัวเล็ก/มีขีดก็ใช้ได้ (มี e2e คุม)
- **ตัวถอด QR ใช้ `jsqr` + `getUserMedia` เอง ไม่ใช้ `html5-qrcode`** — เบากว่าและคุม UI เองได้ · โหลดแบบ **dynamic import ตอนกดเปิดกล้อง** เท่านั้น (แยก chunk 47KB gz ไม่ถ่วงทุกหน้าของแอดมิน) · **ช่องพิมพ์รหัสโชว์เสมอ** ไม่ใช่ fallback ที่ซ่อนไว้ เพราะกล้องไม่ได้สิทธิ์/ไม่มีกล้องเกิดขึ้นจริงหน้าร้าน (ทดสอบแล้ว: ขึ้นข้อความบอกทางออก ไม่พังทั้งหน้า)
- LIFF ใช้ `qrcode` วาดลง canvas (+11KB gz) · หน้าคูปอง poll ทุก 5 วิ → คนขายกดยืนยันแล้วจอลูกค้าเปลี่ยนเป็น "ใช้คูปองแล้ว" เอง (ทดสอบจริงแล้ว)
- ปุ่มแลกถูกปิดเมื่อมีคูปอง pending อยู่ — กติกา "pending ได้ทีละ 1 ใบ" ของ US-50 สะท้อนที่ UI ด้วย ไม่ปล่อยให้กดแล้วค่อยเจอ error
- ทดสอบวงจรเต็มในเบราว์เซอร์: LIFF แลก → คูปอง QR + รหัส `KKUF-NNE4-PGYJ` → admin พิมพ์ `kkuf-nne4-pgyj` → preview → ยืนยัน → ตัด 20 แต้มเหลือ 0 → จอลูกค้าเปลี่ยนเอง → สแกนซ้ำขึ้น "ถูกใช้ไปแล้ว"
