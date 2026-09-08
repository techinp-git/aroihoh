# แผน: โปรไฟล์ลูกค้าใน LIFF (EP-15 Customer Profile)

สถานะ: **US-58 + US-59 done** (8 ก.ย. 2026) — เหลือ US-60 (ตั้งค่า/เบอร์/opt-out ใน LIFF + ป้าย admin) — คู่กับ `plan-loyalty-qr.md` (EP-14) · โปรไฟล์เป็น "บ้าน" ของลูกค้า: ที่อยู่หลายหมุด + แต้ม + รางวัล + ตั้งค่า

## 1. โจทย์
- ลูกค้ามี**หลายหมุด** (บ้าน / ที่ทำงาน / คอนโดแฟน) เลือกตอนสั่งได้โดยไม่ต้องปักใหม่ทุกครั้ง
- เห็น**แต้ม**และ**รางวัล**ที่แลกได้จากหน้าโปรไฟล์ (ต่อกับ EP-14)
- เป็นที่ให้ลูกค้าจัดการตัวเอง: เบอร์โทร, opt-out ข่าวสาร (PDPA self-service)

## 2. สภาพปัจจุบัน (ต้องรู้ก่อนออกแบบ)
| สิ่ง | ตอนนี้ | ผลกับแผน |
|---|---|---|
| `addresses` | สร้างใหม่ทุกออเดอร์ (nested create ใน `orders.service`), ผูก `customerId` | ใช้ตารางเดิมได้ แต่ต้องแยก "ที่บันทึกไว้" ออกจาก "snapshot ของออเดอร์" |
| `addresses.brandId` | **ไม่มี** (tenant ผ่าน customer) | ผิดกติกาเหล็กข้อ 1 — เติมใน migration นี้ + backfill |
| LIFF navigation | เส้นตรง boot→menu→cart→checkout→done/track ไม่มีแท็บ | ต้องเพิ่ม bottom nav |
| `customers.phoneEnc` | มีคอลัมน์ แต่ LIFF ไม่เคยเก็บ | เปิดให้กรอกในโปรไฟล์ (optional) |
| `customers.marketingOptedOut` | admin แก้ได้ (PATCH opt-out) | เปิดให้ลูกค้าแก้เอง |
| Customer = ต่อแบรนด์ | `@@unique([brandId, lineUserId])` | ที่อยู่ที่บันทึกไว้จึง**แยกต่อแบรนด์** (ชิมชีวา กับ A La Carte ไม่แชร์กัน) — รับได้ในเฟส A, ถ้าจะแชร์ต้องย้าย address ไป merchant-level |

## 3. Information architecture ของ LIFF (ใหม่)
```
bottom nav 3 แท็บ (โชว์ทุกหน้า ยกเว้น boot/error)
  🍱 เมนู        → flow เดิม: เมนู → ตะกร้า → เช็คเอาต์ → done/track
  🎯 แต้ม        → EP-14: balance / รางวัล / คูปอง / ประวัติ (US-52/53)
  👤 โปรไฟล์     → หน้านี้
deep link: ?view=profile | ?view=points  (Rich Menu US-10 ใช้ยิงตรง)
```
หน้าโปรไฟล์ (บนลงล่าง):
1. **หัว**: avatar LINE + ชื่อ + "สมาชิกตั้งแต่ ก.ค. 2026"
2. **การ์ดแต้ม**: ยอดแต้มใหญ่ · แถบ "อีก 70 แต้ม → ข้าวมันไก่ฟรี" · ปุ่ม "ดูรางวัล / แลก" → แท็บแต้ม · ปุ่ม "คูปองที่ค้างอยู่" ถ้ามี pending
3. **ที่อยู่ของฉัน**: ลิสต์หมุด (ไอคอน 🏠 บ้าน / 🏢 ที่ทำงาน / 📍 อื่น ๆ) + ป้าย "ค่าเริ่มต้น" + ป้าย "นอกเขตส่ง" (คำนวณสด) · ปุ่ม "เพิ่มที่อยู่" (สูงสุด 5)
4. **ออเดอร์ล่าสุด**: 3 รายการ + "ดูทั้งหมด" (ใช้ `GET /orders/me` เดิม)
5. **ตั้งค่า**: เบอร์โทร (optional, ใช้ให้ไรเดอร์โทร) · สวิตช์ "รับข่าวสาร/โปรโมชัน" (= marketingOptedOut กลับด้าน) · ลิงก์นโยบายความเป็นส่วนตัว (PDPA pack)

## 4. Data model (migration `0015_saved_addresses`)
```prisma
model Address {
  id         String   @id @default(uuid())
  brandId    String                    // ใหม่ — tenant key (backfill จาก customer.brandId)
  customerId String
  label      String?                   // "บ้าน" | "ที่ทำงาน" | กำหนดเอง
  detail     String                    // ที่อยู่ข้อความ (เดิม)
  note       String?                   // ใหม่ — ห้อง/ชั้น/จุดสังเกต/ฝากไว้ที่ รปภ.
  lat        Float
  lng        Float
  isSaved    Boolean  @default(false)  // ใหม่ — true = ในสมุดที่อยู่ · false = snapshot ของออเดอร์
  isDefault  Boolean  @default(false)  // ใหม่ — เลือกให้อัตโนมัติตอนเช็คเอาต์
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt       // ใหม่
  deletedAt  DateTime?                 // ใหม่ — soft delete (ลบจากสมุด แต่ประวัติออเดอร์ยังชี้ได้)

  @@index([customerId, isSaved])
  @@index([brandId])
}
```
กติกา:
- **ออเดอร์ไม่ชี้ไปที่อยู่ที่บันทึกไว้โดยตรง** — ตอนสั่ง server copy เป็นแถวใหม่ `isSaved=false` (snapshot) เหมือนเดิม → แก้/ลบสมุดที่อยู่ทีหลังไม่กระทบออเดอร์เก่า/ใบไรเดอร์
- default ได้ 1 อันต่อลูกค้า (ตั้งใหม่ = ปลดอันเก่าใน transaction)
- สูงสุด 5 หมุดต่อลูกค้า (กัน abuse + UI ไม่ยาว)
- "นอกเขต" **ไม่เก็บลง DB** — คำนวณสดตอนแสดงผ่าน `/delivery/check` เพราะรัศมี/ครัวเปลี่ยนได้ (US-44)

## 5. API (customer JWT ทั้งหมด)
| method | path | หมายเหตุ |
|---|---|---|
| GET | `/me/profile` | displayName, pictureUrl, memberSince, hasPhone, marketingOptedOut, addresses[] (isSaved, ไม่ลบ, เรียง default ก่อน), loyalty {balance, nextReward} (null ถ้า EP-14 ยังไม่ลง), recentOrders 3 |
| PATCH | `/me/profile` | `{phone?, marketingOptedOut?}` — phone encrypt ก่อนเก็บ (`crypto.ts` เดิม) · ห้าม log |
| GET | `/me/addresses` | เฉพาะ isSaved && deletedAt null · แต่ละอันแนบ `deliverable` (คำนวณสด) |
| POST | `/me/addresses` | `{label, detail, note?, lat, lng, isDefault?}` · 422 ถ้าเกิน 5 · คืน deliverable |
| PATCH | `/me/addresses/:id` | เจ้าของเท่านั้น (404 ถ้าไม่ใช่) |
| DELETE | `/me/addresses/:id` | soft delete · ถ้าเป็น default → **เลื่อนหมุดที่แก้ล่าสุดขึ้นเป็น default แทน** (ต่างจากร่างแรกที่ให้ไม่มี default — เช็คเอาต์ควรมีตัวเลือกตั้งต้นเสมอ) |
| POST | `/orders` (เดิม) | รับเพิ่ม `savedAddressId` **หรือ** `deliveryAddress` เดิม · ถ้า savedAddressId: ต้องเป็นของ customer นี้ + ยังไม่ลบ → copy เป็น snapshot · **เช็คเขตซ้ำ server-side เสมอ** (กติกา #5 ไม่เปลี่ยน) · body มี `saveAddress: true` = บันทึกที่อยู่ใหม่เข้าสมุดด้วย |

ทุก endpoint ของสมุดที่อยู่คืน `{ addresses: [...] }` (POST คืน `created` เพิ่ม) — LIFF แทนที่ state ได้ในคำขอเดียว ไม่ต้องยิง GET ตาม

`saveAddress:true` ตอนเช็คเอาต์แล้วสมุดเต็ม 5 = **ข้ามการบันทึกเงียบ ๆ ออเดอร์ยังสำเร็จ** (ไม่ให้เรื่องจดที่อยู่ทำให้สั่งอาหารล้ม) · LIFF รู้จำนวนหมุดจาก `/me/profile` อยู่แล้ว จึงปิดช็อยส์ให้ก่อนได้

Admin: หน้าลูกค้า (US-35) โชว์สมุดที่อยู่แยกจาก snapshot (ป้าย "บันทึกไว้") — เปลี่ยนแค่ select/label

## 6. UX flow
### เช็คเอาต์ (แก้จากเดิม)
```
ตะกร้า → เช็คเอาต์
  [ชิป: 🏠 บ้าน (ค่าเริ่มต้น) · 🏢 ที่ทำงาน · 📍 ปักหมุดใหม่]
  เลือกชิป → แผนที่ AddressPicker เลื่อนไปหมุดนั้น (แก้ได้ชั่วคราว ไม่ทับสมุด) → /delivery/check
  ปักใหม่ → AddressPicker เดิม + checkbox "บันทึกที่อยู่นี้ไว้" + เลือก label
  ลูกค้าใหม่ (ไม่มีหมุด) → เหมือนเดิมทุกอย่าง ไม่มีชิป
```
### สมุดที่อยู่ (โปรไฟล์)
```
โปรไฟล์ → "ที่อยู่ของฉัน" → เพิ่ม/แก้ (AddressPicker เดิม + label + note) → บันทึก
  แสดง "นอกเขตส่ง" สีเทาถ้า deliverable=false (บันทึกได้ แต่สั่งไปที่นั่นไม่ได้ — ให้รู้ล่วงหน้า)
  ปุ่ม "ตั้งเป็นค่าเริ่มต้น" / ลบ (ยืนยันก่อน)
```

## 7. ความปลอดภัย / PDPA
- ที่อยู่ + พิกัด = PII → **ห้าม log** (กติกา #6) · endpoint `/me/*` ผูก `customerId` จาก JWT เท่านั้น ไม่รับจาก body
- เบอร์โทร encrypt at-rest (`phoneEnc`) · GET คืนแค่ `hasPhone` + 4 ตัวท้าย
- ลบบัญชี/ถอนความยินยอม (สิทธิ์ PDPA) — **นอกขอบเขต** EP นี้ แต่ soft delete ที่อยู่ + opt-out self-service ปูทางไว้
- rate limit POST/PATCH addresses 20 ครั้ง/ชม. ต่อลูกค้า

## 8. แตกงาน
| story | เนื้อหา | ประมาณ |
|---|---|---|
| US-58 ✅ | migration 0015 (brandId backfill + isSaved/isDefault/note/updatedAt/deletedAt) · module `profile` (GET/PATCH /me/profile, CRUD /me/addresses ≤5, default 1 อัน, deliverable สด) · orders รับ `savedAddressId` + `saveAddress` (snapshot copy, re-check เขต) · e2e: ข้ามลูกค้า 404, เกิน 5 = 422, สั่งด้วย savedAddressId แล้วแก้ที่อยู่ไม่กระทบออเดอร์ | 6 ชม. |
| US-59 ✅ | LIFF: bottom nav 3 แท็บ + deep link `?view=` · หน้าโปรไฟล์ (หัว/การ์ดแต้ม/ที่อยู่/ออเดอร์ล่าสุด/ตั้งค่า) · สมุดที่อยู่ เพิ่ม/แก้/ลบ/ตั้ง default (reuse AddressPicker) · เช็คเอาต์เลือกชิปที่อยู่ + "บันทึกที่อยู่นี้" | 8 ชม. |
| US-60 | ตั้งค่าโปรไฟล์: เบอร์โทร (encrypt, โชว์ 4 ตัวท้าย) · สวิตช์รับข่าวสาร (PDPA self-service) · ลิงก์ privacy policy · admin หน้าลูกค้าแยกป้าย "บันทึกไว้" | 3 ชม. |

ลำดับ: US-58 → US-59 → US-60 · การ์ดแต้มในโปรไฟล์โชว์เมื่อ EP-14 US-50 ลงแล้ว (ก่อนหน้านั้นซ่อนการ์ด ไม่บล็อกกัน)

## 9. ตัดสินใจแล้ว / ยังค้าง
เคาะแล้ว (8 ก.ย. 2026):
- **LIFF 3 แท็บ** (เมนู / แต้ม / โปรไฟล์) — แท็บแต้มโชว์เมื่อ EP-14 ลงแล้วเท่านั้น ระหว่างนี้เห็น 2 แท็บ
- **จำกัด 5 หมุดต่อลูกค้า** (`MAX_SAVED_ADDRESSES` ใน `profile/address-book.ts`)
- **ที่อยู่ไม่แชร์ข้ามแบรนด์** — `addresses.brandId` เป็น tenant key, ทุก query กรองทั้ง customerId และ brandId

ยังค้าง (เป็นเรื่องของ US-59/60 ไม่บล็อก US-58):
1. **แท็บ 3 อัน (เมนู/แต้ม/โปรไฟล์)** หรือ 2 อัน (เมนู/โปรไฟล์ แล้วแต้มอยู่ในโปรไฟล์) — แนะนำ 3 เพราะแต้มคือตัวดึงให้เปิดแอป
2. เบอร์โทรจำเป็นตอนสั่งไหม (ตอนนี้ไม่บังคับ) — ถ้าบังคับ ต้องแก้ checkout ด้วย

## 10. บันทึกตอนลง US-58 (8 ก.ย. 2026)
- `delivery.service` เพิ่ม `reasonCode` (`store_closed` / `out_of_radius` / `no_fee_rule`) + เมธอด `isDeliverable()` — สมุดที่อยู่ต้องแยก "ส่งไม่ถึง" ออกจาก "ร้านปิดอยู่ตอนนี้" ไม่งั้นตอนร้านปิดหมุดทุกอันขึ้นนอกเขตพร้อมกัน · `quote()` ที่ใช้ตอนสร้างออเดอร์ยังเช็คเวลาทำการเหมือนเดิม
- `orders.service` เช็คเขตซ้ำแม้สั่งด้วยหมุดจากสมุด (ครัวย้าย/รัศมีเปลี่ยนได้หลังบันทึกหมุด)
- ⚠️ gotcha e2e: `uuid()` ใน `test/e2e.mjs` คืน `e2e-<timestamp>-<rand>` — **ห้าม `.slice(0,8)`** ได้ชื่อซ้ำข้ามรอบ (dev-login upsert ตามชื่อ → ลูกค้าเก่ามี 5 หมุดค้าง เทสต์เพดานพัง) ใช้ทั้งก้อน
- ยังไม่ทำ (อยู่ใน US-59/60): UI ทั้งหมด, ป้ายแยก saved/snapshot ในหน้า admin

## 11. บันทึกตอนลง US-59 (8 ก.ย. 2026)
- แท็บ "แต้ม" ถูกวางโครงครบแล้วแต่ **ผูกกับ `profile.loyalty`** — EP-14 ยังไม่ลง = ไม่โชว์ ไม่ให้ลูกค้ากดเจอหน้าว่าง พอ US-50 คืน loyalty มา แท็บโผล่เองโดยไม่ต้องแก้ LIFF (หน้าแลกรางวัลเต็มรูปแบบยังเป็นงานของ US-52/53)
- ทดสอบจริงในเบราว์เซอร์กับ API+DB จริง เจอบั๊ก 3 ตัวแล้วแก้: ค้างหน้า "สั่งสำเร็จ" ตอนกดแท็บเมนู · ตะกร้าไม่ถูกล้างหลังสั่ง (ของเก่าค้าง) · โน้ตของหมุดในสมุดติดไปกับหมุดที่ปักใหม่
- ยังไม่ทำ: ส่วน "ตั้งค่า" ในโปรไฟล์ (เบอร์โทร / สวิตช์รับข่าวสาร / ลิงก์ privacy) = US-60
