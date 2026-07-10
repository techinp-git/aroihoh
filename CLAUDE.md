# AroiHoh (Brand.Delivery)

ระบบสั่งอาหารผ่าน LINE OA + LIFF (สั่งตรง ไม่เสีย GP) — เฟส A ใช้กับแบรนด์ตัวเอง "ชิมชีวา One Price 60" ย่านอโศก/มศว

## Source of truth
- Backlog/task: AI Intranet → project `fb-project` (org `c46e73f8-0328-4627-bb51-df0eb4b70c47`)
- เอกสารแผน: Knowledge Board "F&B" (`1f9d454c-1468-49bd-9311-357f73528bf1`) — การ์ด "แผนระบบ LINE OA + LIFF" (v2.0) และ "หลายแบรนด์ ครัวเดียว"
- อัปเดตความคืบหน้ากลับเข้า task ด้วย `post_task_log` ทุกครั้งที่จบงานสำคัญ

## Architecture (monorepo — npm workspaces)
| path | คือ | stack |
|---|---|---|
| `apps/api` | Backend API + LINE webhook | NestJS 11, Prisma, PostgreSQL+PostGIS, Redis/BullMQ |
| `apps/liff` | หน้าเว็บลูกค้าใน LINE (สั่งอาหาร) | React 18 + Vite + @line/liff |
| `apps/admin` | หลังบ้านร้าน (ออเดอร์/เมนู/รายงาน) | React 18 + Vite |
| `packages/shared` | types/constants ใช้ร่วม | TypeScript |

Module ใน `apps/api/src/modules/`:
- ลงแล้ว: `auth` (US-01 LIFF ID token→JWT), `menu` (US-14 CRUD + public list), `delivery` (US-15 zone check radius + fee flat/tiered/per_km), `orders` (US-02/04/05 สร้างออเดอร์ idempotent + re-check เขต/ราคา server-side + ดูออเดอร์ตัวเอง; US-12 admin เปลี่ยนสถานะไล่ลำดับ + audit log + list), `admin-auth` (US-29 login email/password→admin JWT + me), `admin-users` (US-30 CRUD user + RBAC role/สิทธิ์ต่อแบรนด์), `brands`, `health`
- pure domain (unit-tested, 21 tests): `delivery/geo.ts`, `delivery/fee.ts`, `orders/pricing.ts`, `orders/status.ts`; orders.service มี unit test mock prisma/delivery
- ยังไม่ลง: `line` (webhook/flex/push), `payments` (US-06/07), `notifications` (BullMQ US-09), `telegram` (EP-11)

**Guards** (`src/common/guards/`): `JwtAuthGuard` (customer Bearer JWT — ผูก orders) · `AdminJwtGuard` (admin Bearer JWT, secret แยก `ADMIN_JWT_SECRET`, fail-fast ถ้าไม่ตั้ง) + `RolesGuard` (`@Roles`) ป้องกัน `/api/admin/*` — **ห้าม**ใช้ customer JWT ป้องกัน endpoint แอดมิน · ทุก endpoint admin ที่รับ brandId ต้องผ่าน `assertBrandAccess(admin, brandId)` (กันข้ามแบรนด์) · `AdminKeyGuard` เลิกใช้แล้ว (แทนด้วย admin login US-29)
- Roles: `owner` (จัดการ user + ทุกอย่าง) · `manager` (ร้าน/เมนู/ออเดอร์ ทุกแบรนด์) · `staff` (เฉพาะแบรนด์ที่ผูกใน admin_brands) · owner admin จาก seed: env `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`

## Commands
```bash
npm install                 # ครั้งแรก
npm run db:up               # Postgres(PostGIS) + Redis ผ่าน docker compose
npm run build               # build ทุก workspace (shared ต้องมาก่อนเสมอ)
npm run dev:api             # NestJS watch mode (port 3000, prefix /api)
npm run dev:liff            # Vite dev (port 5173)
npm run dev:admin           # Vite dev (port 5174)
npm test -w apps/api        # unit tests (jest) — โดเมน logic: geo/fee/pricing
npm run prisma:migrate -w apps/api   # apply migration (ต้องมี DB)
npm run prisma:seed -w apps/api      # seed แบรนด์ชิมชีวา + เมนู + เขตส่งตัวอย่าง
```

## ข้อห้าม / กติกาเหล็ก
1. **ทุก query DB ต้องกรอง tenant key** (merchant_id/brand_id) ตั้งแต่ migration แรก — ห้ามมีตาราง business data ที่ไม่มี tenant key
2. **เงินคำนวณฝั่ง server เท่านั้น** — ค่าส่ง, ส่วนลด, ยอดรวม ห้ามเชื่อค่าจาก client (client แสดงผลอย่างเดียว)
3. **LINE webhook ต้อง verify `x-line-signature` ทุก event** ก่อนประมวลผล
4. **สร้างออเดอร์/รับ payment webhook ต้อง idempotent** — กันกดซ้ำ/ยิงซ้ำ (US-04, US-06)
5. **เช็คเขตจัดส่ง server-side ซ้ำเสมอตอนยืนยันออเดอร์** — ผล check ฝั่ง LIFF เป็นแค่ UX (422 ถ้านอกเขต)
6. **PDPA**: ห้าม log PII (ชื่อ/เบอร์/พิกัดลูกค้า) ลง log ทั่วไป, broadcast ต้องเคารพ opt-out
7. Push message ผ่านคิว BullMQ + กันส่งซ้ำด้วย `message_logs` (โควตา LINE มีจำกัด)

## การตัดสินใจที่ยังค้าง (ห้ามเดาเอง — ดู task กลุ่ม PRE-DEV)
- **Schema tenant**: merchants/stores (แผน v2.0) vs brands/kitchens (ชิมชีวา) → แนวโน้มรวมเป็น merchant → brands → kitchens แต่ต้องเคาะใน task "DOC: Prisma schema + ERD" ก่อนเขียน model จริง — `apps/api/prisma/schema.prisma` จึงยังว่างโดยตั้งใจ
- **ADR-02**: เช็คเขตแบบ Haversine radius ก่อน vs PostGIS เต็มรูปแบบตั้งแต่แรก
- **SETUP-4**: payment gateway (Omise/2C2P/GB Prime Pay)
- **ADR-03**: hosting (Railway/Render/Cloud Run)

## การตัดสินใจที่เคาะแล้ว (ตอนตั้งโครง 8 ก.ค. 2026)
- ADR-01: **NestJS** (ไม่ใช่ Express เปล่า) — โครงสร้าง module ชัด เหมาะกับ solo dev + AI ทำงานหลาย session
- ADR-04: **monorepo npm workspaces** (เครื่อง dev ไม่มี pnpm) — shared types อยู่ `packages/shared`
- DB: PostgreSQL + **PostGIS** (docker image `postgis/postgis:16-3.4`) + Prisma

## Conventions
- TypeScript strict ทุก workspace
- Branch: `main` = deployable, feature branch ตั้งชื่อตามรหัส story เช่น `us-01-liff-login`
- Commit message อ้างรหัส story/task เช่น `US-06: add promptpay webhook`
- เก็บเงินเป็นหน่วยย่อย (สตางค์/integer) ไม่ใช้ float
