# AroiHoh (Brand.Delivery)

ระบบสั่งอาหารผ่าน LINE OA + LIFF (สั่งตรง ไม่เสีย GP) — เฟส A ใช้กับแบรนด์ตัวเอง "ชิมชีวา One Price 60" ย่านอโศก/มศว

## สถานะ ณ 23 ก.ค. 2026 (อัปเดตทุกครั้งที่ audit)
- EP-12 (หลายแบรนด์ ครัวเดียว) + EP-13 (SaaS readiness) = **done ครบทุก subtask**
- **คอขวดเดียวที่บล็อกงานเหลือ = `SETUP-1`** (LINE OA + Messaging API Channel + LIFF App + keys) — LINE layer เขียนครบแล้วแต่ **gated**: ไม่มี access token → `LineClient` skip เงียบ ๆ · บล็อก US-01, US-08, US-09, US-10 และการยิง chat/broadcast จริง
- คอขวดเดียวที่เหลือ = `SETUP-1` (LINE keys) — deploy เสร็จแล้ว webhook URL พร้อมใช้
- ✅ ปิดไปแล้ว 23 ก.ค.: US-08 (Flex) · US-09 (BullMQ queue) · US-19 (margin/breakeven) — ทั้งหมดทดสอบกับ Redis + DB จริงแล้ว
- ✅ US-10 Rich Menu ปิดแล้ว → **หนี้โค้ดฝั่ง LINE หมด** ที่เหลือรอ keys/deploy ล้วน ๆ
- ✅ DEPLOY-1 **เสร็จแล้ว** 23 ก.ค.: prod รันที่ `49.13.57.24` (`/opt/aroihoh`, compose: api+postgis+redis) · `aroihoh-api/order/admin.jivecode.click` HTTPS ผ่าน Caddy บน host (Caddyfile ร่วมกับ health/jcorp/router — แก้ต้อง `caddy validate` ก่อน reload เสมอ) · seed แล้ว · คิว BullMQ ต่อ Redis ได้จริง · dev-login ปิด (403)
- ⚠️ deploy gotchas ที่เจอจริง: seed ในคอนเทนเนอร์ต้อง `npx ts-node -O '{\"module\":\"commonjs\"}' prisma/seed.ts` (ESM พัง) · `VITE_API_BASE_URL` **ต้องมี `/api` ต่อท้าย** · เขียน log ที่ `/tmp` ไม่ได้ (มีของ project อื่น) ใช้ `/root/`
- ⚠️ legal blocker ก่อนเก็บข้อมูลลูกค้าจริง: **PDPA pack** (privacy policy + consent + opt-out) ยังไม่มี — โค้ด opt-out พร้อมแล้วแต่เอกสารยังไม่ได้เขียน

## Source of truth
- Backlog/task: AI Intranet → project `fb-project` (org `c46e73f8-0328-4627-bb51-df0eb4b70c47`)
- เอกสารแผน: Knowledge Board "F&B" (`1f9d454c-1468-49bd-9311-357f73528bf1`) — การ์ด "แผนระบบ LINE OA + LIFF" (v2.0) และ "หลายแบรนด์ ครัวเดียว"
- อัปเดตความคืบหน้ากลับเข้า task ด้วย `post_task_log` ทุกครั้งที่จบงานสำคัญ

## Architecture (monorepo — npm workspaces)
| path | คือ | stack |
|---|---|---|
| `apps/api` | Backend API + LINE webhook | NestJS 11, Prisma, PostgreSQL+PostGIS, Redis/BullMQ |
| `apps/liff` | หน้าเว็บลูกค้าใน LINE (สั่งอาหาร) — เมนู→ตะกร้า→เช็คเขต→สั่ง COD→ติดตามสถานะ (US-02/03/05 done); auth: dev-login (dev) / liff→/auth/line (รอ SETUP-1) | React 18 + Vite + @line/liff |
| `apps/admin` | หลังบ้านร้าน (ออเดอร์/เมนู/รายงาน) | React 18 + Vite |
| `packages/shared` | types/constants ใช้ร่วม | TypeScript |

Module ใน `apps/api/src/modules/`:
- ลงแล้ว: `auth` (US-01 LIFF ID token→JWT), `menu` (US-14 CRUD + public list), `delivery` (US-15 zone check radius + fee flat/tiered/per_km), `orders` (US-02/04/05 สร้างออเดอร์ idempotent + re-check เขต/ราคา server-side + ดูออเดอร์ตัวเอง; US-12 admin เปลี่ยนสถานะไล่ลำดับ + audit log + list), `admin-auth` (US-29 login email/password→admin JWT + me), `admin-users` (US-30 CRUD user + RBAC role/สิทธิ์ต่อแบรนด์), `brands`, `health`
- pure domain (unit-tested — รวมทั้งโปรเจกต์ **71 tests / 13 suites**): `delivery/geo.ts`, `delivery/fee.ts`, `orders/pricing.ts`, `orders/status.ts`; orders.service มี unit test mock prisma/delivery
- ลงเพิ่ม: `payments` (US-07 COD mark-paid + config codEnabled ต่อแบรนด์), `reports` (US-13 backend — GET /admin/reports/daily, pure `summarizeOrders`), `customers` (US-35 admin list+detail+ประวัติออเดอร์, PDPA ไม่คืน phoneEnc, pure `computeCustomerStats`)
- ลงเพิ่ม: `customers` (US-35), `chat` (US-21 core — chat_messages, conversations/thread/send; ยิงเข้า LINE จริงรอ SETUP-1)
- ลงเพิ่ม: `broadcasts` (US-18 — preview reach/create+list/detail · จอง message_logs(queued, dedupeKey) กันส่งซ้ำ · owner/manager · ยิง LINE จริงรอ SETUP-1 = BullMQ worker) · รับได้ทั้ง contentId+audienceId หรือ message+segment(tags) ad-hoc · customers PATCH /:id/opt-out (PDPA)
- ลงเพิ่ม: `content` (US-18 คลังข้อความใช้ซ้ำ CRUD) + `audiences` (US-18 กลุ่มเป้าหมายบันทึกไว้ · pure `rules.ts` resolveAudienceByRules ประเมินสด: tenure_min_days/order_count_in_window/lapsed/tags, match all|any, หัก opt-out เสมอ · presets 3 ตัว · CRUD+preview reach) — ทั้งคู่ owner/manager
- ลงเพิ่ม: `line` (US-10 core — POST /api/line/webhook/:brandId verify `x-line-signature` บน rawBody (main.ts rawBody:true, pure `line-signature.ts` 6 tests) · inbound text → Chat Center · follow → welcome · `LineClient` push/reply (gated: ไม่มี access token → skipped) · broadcast dispatch POST /admin/broadcasts/:id/dispatch drain message_logs) — ยิงจริงรอ SETUP-1 keys · Flex(US-08)/BullMQ queue(US-09)/Rich Menu ลงครบแล้ว (ดูด้านล่าง)
- ลงเพิ่ม: `notifications` (US-08/09 — คิวแจ้งเตือน LINE) · pure `dedupe.ts` (buildDedupeKey `confirm:<orderId>` / `status:<orderId>:<status>`, isRetryableStatus 429/5xx, backoffMs, isValidJob) · `notifications.service.ts` จองแถว `message_logs(queued)` ก่อนเข้าคิว → **P2002 = เคยส่งแล้ว ข้าม** (dedupe บังคับที่ DB unique ไม่ใช่แค่ระดับแอป) · BullMQ attempts 3 + exponential backoff, concurrency 3 · **ไม่มี `REDIS_URL` = โหมด inline** (ส่งทันที ไม่มี retry — dev/CI) · ไม่มี LINE keys = `unreserve()` ลบแถวที่จองทิ้ง ให้ส่งใหม่ได้เมื่อ keys มา (ตัวเลขไม่เพี้ยน) · hook ที่ orders.service: create → `notifyOrderConfirmed` (Flex), updateStatus → `notifyStatusChanged` (เฉพาะ `shouldNotify`) ทั้งคู่ `void ... .catch()` ไม่ให้ push พังทำ API พัง
- ลงเพิ่ม: `line/flex.ts` (US-08 — pure builder) `buildOrderConfirmFlex` bubble ใบยืนยัน (header สีแบรนด์จาก theme US-39 + รายการ + สรุปเงิน + ปุ่ม deep link `https://liff.line.me/<liffId>?orderId=`) · `orderConfirmAltText` (≤400 ตัวอักษร) · `statusUpdateText` · **`NOTIFY_STATUSES` = confirmed/delivering/completed/cancelled เท่านั้น** (pending/preparing/ready ไม่ยิง — ประหยัดโควตา) · `LineClient.pushFlex` · 22 tests
- ลงเพิ่ม: `line/richmenu.ts` (US-10 Rich Menu — pure builder, 24 tests) · กริด 3×2 = 6 ปุ่ม บนรูป 2500×1686 (`gridBounds` คอลัมน์ขวากิน 834 รับเศษ 2500÷3 ไม่ลงตัว — ไม่งั้นขอบขวากดไม่ได้) · **ไม่มี liffId = ตัดปุ่ม deep link ทิ้ง** เหลือปุ่มส่งข้อความให้ auto-reply ตอบ (กันปุ่มกดแล้วเงียบ) · `validateRichMenu` ตรวจก่อนยิง (LINE ตอบ 400 ไม่บอกเหตุผล) + `findOverlaps` · LineClient: createRichMenu / uploadRichMenuImage (**ใช้ `api-data.line.me` คนละโดเมน** · เช็ค jpeg|png ≤1MB) / setDefaultRichMenu / deleteRichMenu · API `GET /admin/line-config/richmenu/preview` (ไม่ยิง LINE) + `POST /admin/line-config/richmenu` (owner) · **rollback: อัปโหลด/ตั้ง default พังเมื่อไหร่ ลบเมนูที่เพิ่งสร้างทิ้ง** และลบตัวเก่า*หลัง*ตัวใหม่สำเร็จ (ลบก่อน = ลูกค้าไม่มีเมนูช่วงคาบเกี่ยว) · เก็บ `brands.richMenuId`
- ยังไม่ลง: payment gateway US-06 (รอ SETUP-4), `telegram` (EP-11)
- migrations: 0001_init · 0002_add_cod_enabled · 0003_chat_messages · 0004_customer_tags · 0005_store_hours · 0006_broadcasts (customers.marketingOptedOut + broadcasts) · 0007_content_audiences (content_library + audiences + broadcasts.contentId/audienceId) · 0008_message_channel (MessageChannel reply|push + MessageType auto_reply/chat — groundwork ให้ US-09 ยังไม่ใช่ตัว US-09) · 0009_order_ready · 0010_roles_kitchen_chat · 0011_menu_cost (US-19: `menu_items.costPrice` + `order_items.unitCost` snapshot + `brands.fixedCostDaily`)
- US-16 store: kitchens.openTime/closeTime + isOpen · `store` module (GET /admin/store, PATCH pause/hours) · delivery.quote เช็ค isAccepting (พัก/นอกเวลา → order 422) · Settings มีการ์ดสถานะร้าน
- US-21 chat: 3-column (conversations | thread | customer panel = ประวัติออเดอร์+แท็ก) · tag ลูกค้า = customers.tags + PATCH /admin/customers/:id/tags · ที่เหลือ = LINE ส่ง/รับจริง (SETUP-1)
- แชต auto-refresh: **poll 5s** (ยังไม่มี SSE เหมือน orders/KDS) ทั้ง inbox + ห้องที่เปิดอยู่ · หยุด poll เมื่อ `document.hidden` แล้วยิงทันทีตอนกลับมาที่แท็บ · `sameThread()` คงอ็อบเจกต์เดิมถ้าข้อความไม่เปลี่ยน (ไม่งั้น re-render ทุก 5s เด้ง scroll ลงล่างจนอ่านย้อนไม่ได้) · error ตอน poll เงียบ ไม่เด้ง alert รบกวนคนตอบแชต
- admin routing: หน้าปัจจุบันอยู่ใน **URL hash** (`#/orders`) — refresh/แปะลิงก์/ปุ่ม back ใช้ได้ · แบรนด์ที่เลือกเก็บ `localStorage['aroihoh.brandId']` (ถ้าแบรนด์นั้นหายไปแล้วค่อย fallback ตัวแรก) · คลิกเมนู = push history, การเด้งอัตโนมัติตาม role (US-45) = replace (ไม่ให้ back ติดลูป)
- US-40 chat รวมทุกแบรนด์ (EP-12): GET /admin/chat/conversations ไม่ส่ง brandId = inbox รวมทุกแบรนด์ที่ admin มีสิทธิ์ (ส่ง brandId = กรองแบรนด์เดียว เดิม) · ทุกห้อง+thread ติด brandId/brandName · UI: BrandChip สีตามชื่อแบรนด์ + header "คุยผ่าน OA: X" + composer placeholder บอก OA + dropdown กรองแบรนด์ (โชว์เมื่อ >1 แบรนด์) · ตอบกลับ route ผ่าน OA ของแบรนด์นั้น (conv.brandId ไม่ใช่ตัวเลือกแบรนด์ด้านบน)
- US-11 realtime: SSE `GET /api/admin/orders/stream?brandId=&token=` (order-events.service RxJS bus, emit ตอน create/status) · admin Orders มี beep+flash+badge 🟢, EventSource reconnect · LIFF track poll 5s
- US-41 สถานะ ready (EP-12): order flow = pending→confirmed→preparing→**ready**(ครัวจัดเสร็จ รอไรเดอร์)→delivering→completed · migration 0009 (`ADD VALUE 'ready' BEFORE 'delivering'`) · ORDER_STATUS_FLOW + STATUS_TH (admin/liff) · status.ts generic ไม่ต้องแก้
- US-37 จอครัว KDS (EP-12): `GET /admin/kitchen/orders` (ไม่รับ brandId = รวมทุกแบรนด์ที่ admin มีสิทธิ์, active pending/confirmed/preparing/ready, เรียงเก่าสุดก่อน + brandName + customer.displayName + address) · SSE `GET /admin/kitchen/stream?token=` filter ตาม admin.brandIds · admin หน้า "ครัว (KDS)" การ์ด grid: BrandChip สีแบรนด์ + ขอบสีตามสถานะ + ปุ่มดันสถานะ (pending→รับออเดอร์ / confirmed→เริ่มทำ / preparing→จัดเสร็จ / ready→ไรเดอร์รับแล้ว) + beep/flash realtime · reuse changeStatus(brandId ต่อออเดอร์)
- US-42/43 พิมพ์ 80mm (EP-12): `apps/admin/src/lib/print.ts` (printHtml ผ่าน hidden iframe + kitchenTicketHtml/riderLabelHtml, @page 80mm) · กด "รับออเดอร์"(→confirmed) พิมพ์ใบครัว (เมนู/จำนวน/note ตัวใหญ่) · กด "จัดเสร็จ"(→ready) พิมพ์ label ไรเดอร์ (#order/แบรนด์/ชื่อ/ที่อยู่/พิกัด/ยอดเก็บ COD) · ปุ่ม 🖨️ บนการ์ด = พิมพ์ซ้ำ · KDS include customer+address (ไม่คืน phoneEnc PDPA) · พิมพ์เงียบ = Chrome `--kiosk-printing` (ดู docs/kitchen-print.md)
- US-36b คัดลอกเมนู (EP-12): `POST /admin/menu/copy {sourceBrandId,targetBrandId}` (assertBrandAccess ×2) copy หมวด+item ใน transaction (id ใหม่, คงราคา/isAvailable, append) · UI หน้า Menu การ์ด "คัดลอกเมนูจาก" เด่นเมื่อแบรนด์เป้าหมายว่าง
- US-44 จัดการครัว (EP-12): `kitchens` module (ย้ายจาก brands) — `GET /admin/kitchens` (รายละเอียด lat/lng/รัศมี/fee/brandCount, owner/manager), `POST`/`PATCH` (owner) · สร้างครัว provision flat DeliveryFeeRule ให้สั่งได้ทันที · แก้ flatFee = ปิดกฎเดิม+สร้าง flat ใหม่ · UI KitchenManager card ใน Settings
- US-38 dashboard รวม merchant (EP-12): `GET /admin/reports/merchant-daily` (ไม่รับ brandId, รวม admin.brandIds) = total + per-brand (count>0, เรียง revenue) · Dashboard section "รวมทุกแบรนด์" + ตาราง BrandChip (โชว์เมื่อ >1 แบรนด์มีออเดอร์)
- US-39 LIFF theme ต่อแบรนด์ (EP-12): `GET /brand/:brandId` (public) คืน name/logoUrl/theme · brand update รับ `theme` Json ({primaryColor}) · admin BrandManager ปุ่ม 🎨 ธีม (โลโก้ URL + color picker) · LIFF โหลด getBrand → หัวเว็บใช้ `--brand-primary` + โลโก้ + ชื่อแบรนด์ + document.title (ชิมชีวา=ส้ม default, A La Carte=เข้ม) · **EP-12 ครบทุก subtask**
- **หน้าตั้งค่า LINE OA** (US-25 บางส่วน/SETUP-1 ส่วน B): admin Settings การ์ด "เชื่อมต่อ LINE OA" (owner) → `line-config` module GET/PUT/POST test `/admin/line-config` · GET ไม่คืน secret/token (แค่ hasX + configured + webhookUrl) · owner เสียบ Channel ID/secret/token/LIFF ID เองได้ ไม่ต้องแก้ .env · `LineClient.getBotInfo` ทดสอบ token · env `PUBLIC_API_URL` ประกอบ webhook URL · encrypt secret/token แล้ว (ดู SEC-1 ด้านล่าง)
- **admin UI ครบ 8 หน้า** (feature-complete): Dashboard (สรุป+date picker เลือกวัน US-13), Orders (สถานะ/ยกเลิก/COD/realtime/⬇CSV export), Chat, **ส่งข่าวสาร/Broadcast** (US-18 — 3 แท็บ: ส่ง(เลือก content+audience+preview reach) / คลังข้อความ / กลุ่มเป้าหมาย(rule builder+presets), ซ่อนจาก staff), Menu (**CRUD เต็ม**: เพิ่ม/แก้/ลบ+หมวด+รูป US-14 · GET /admin/menu/categories), Customers, Users&RBAC(owner), Settings · US-13/14 done · **US-19 done** (CSV + margin/breakeven)
- **CI** `.github/workflows/ci.yml`: งาน `e2e` (postgis+redis→migrate→seed→boot→`apps/api/test/e2e.mjs` ~98 เช็ค fetch ล้วน) ปิดหนี้ CTO · รัน local: `npm run test:e2e -w apps/api`

- US-45 roles kitchen/chat_agent (EP-13): AdminRole + kitchen (เห็นแค่ KDS+ไล่สถานะ) / chat_agent (เห็นแค่แชต) · migration 0010 · brand-scoped (staff/kitchen/chat_agent ต้องผูก brandIds, resolveBrandIds คืน assigned) · API gate: chat→+chat_agent, kitchen/admin-orders→+kitchen, customers(PII)/reports→ตัด kitchen/chat_agent (class @Roles) · admin NAV ต่อ role (roles[] ต่อเมนู + auto-redirect เมนูแรก) · Users dropdown + brand requirement · menu/store ยังเปิดทุก admin role (low-sev, documented)
- US-46 chat presence (EP-13): `chat-presence.service.ts` in-memory Map<customerId, viewers> TTL 12s · `POST /admin/chat/:customerId/presence` heartbeat คืน viewers คนอื่น · Chat.tsx heartbeat ทุก 8s ระหว่างเปิดห้อง → โชว์ "👁 X กำลังดูห้องนี้อยู่" ใน thread header (กันตอบชนกัน เบา ไม่ต้อง assignment)
- US-19 margin/คุ้มทุน: pure `reports/margin.ts` — `summarizeMargin` (แยกค่าส่งออกจาก contribution เพราะจ่ายไรเดอร์ต่อ · **`costCoverage`** % กล่องที่มีข้อมูลต้นทุน) · `computeBreakeven` (กล่อง/วัน = fixedCostDaily ÷ contributionPerBox, ปัดขึ้น · คืน `null`+`reason` เมื่อยังไม่ตั้งค่าคงที่/ยังไม่กรอกต้นทุน/contribution ≤ 0 — **ไม่เดาตัวเลข**) · `marginByMenu` · 19 tests · API `GET /admin/reports/margin` + `PATCH /admin/reports/fixed-cost` (owner) · UI: `MarginCard.tsx` ใน Dashboard (แถบคืบหน้าเทียบจุดคุ้มทุน + แบนเนอร์เตือนเมื่อ coverage < 100%) + หน้า Menu มีช่องต้นทุน + คอลัมน์กำไร + live preview เตือนต้นทุน > ราคาขาย · ⚠️ `getPublicMenu` ใช้ `select` ชัดเจน **ห้ามคืน costPrice ให้ลูกค้า**
- SEC-1 encrypt LINE creds at-rest (EP-13): `src/common/crypto.ts` AES-256-GCM (`encryptSecret`/`decryptSecret`, รูปแบบ `v1:iv:tag:ct` base64) · คีย์ env `ENCRYPTION_KEY` (hash→32B) · ไม่มีคีย์ (dev/CI) = passthrough · backward-compat: ค่า plaintext เดิม (ไม่มี prefix v1:) อ่านออกตรงๆ · wire ที่ line-config.service (encrypt เขียน) + line.client.config (decrypt อ่าน) · main.ts เตือนถ้า prod ไม่ตั้งคีย์ · ⚠️ prod ต้องตั้ง ENCRYPTION_KEY + ห้ามเปลี่ยนหลังมีข้อมูล (ถอดไม่ออก) · unit 7 tests (round-trip/tamper/legacy)

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
npm run test:e2e -w apps/api # E2E smoke (ยิง HTTP จริง — ต้องมี API รันที่ :3000 + DB seed แล้ว)
npm run prisma:migrate -w apps/api   # apply migration (ต้องมี DB)
npm run prisma:seed -w apps/api      # seed แบรนด์ชิมชีวา + เมนู + เขตส่งตัวอย่าง
```

**CI** (`.github/workflows/ci.yml`): 2 งาน — `build` (npm ci + build + jest ทุก workspace) และ `e2e` (postgis+redis service → migrate deploy → seed → boot API → `test/e2e.mjs` ~98 เช็ค). E2E ครอบกติกาเหล็ก: คิดเงิน server, เช็คเขต 422, idempotent, tenant isolation, RBAC (customer JWT เข้า admin ไม่ได้), status transition, พักร้าน→422. ไม่พึ่ง lib นอก (fetch ล้วน).

## ข้อห้าม / กติกาเหล็ก
1. **ทุก query DB ต้องกรอง tenant key** (merchant_id/brand_id) ตั้งแต่ migration แรก — ห้ามมีตาราง business data ที่ไม่มี tenant key
2. **เงินคำนวณฝั่ง server เท่านั้น** — ค่าส่ง, ส่วนลด, ยอดรวม ห้ามเชื่อค่าจาก client (client แสดงผลอย่างเดียว)
3. **LINE webhook ต้อง verify `x-line-signature` ทุก event** ก่อนประมวลผล
4. **สร้างออเดอร์/รับ payment webhook ต้อง idempotent** — กันกดซ้ำ/ยิงซ้ำ (US-04, US-06)
5. **เช็คเขตจัดส่ง server-side ซ้ำเสมอตอนยืนยันออเดอร์** — ผล check ฝั่ง LIFF เป็นแค่ UX (422 ถ้านอกเขต)
6. **PDPA**: ห้าม log PII (ชื่อ/เบอร์/พิกัดลูกค้า) ลง log ทั่วไป, broadcast ต้องเคารพ opt-out
7. Push message ผ่านคิว BullMQ + กันส่งซ้ำด้วย `message_logs` (โควตา LINE มีจำกัด)

## การตัดสินใจที่ยังค้าง (ห้ามเดาเอง — ดู task กลุ่ม PRE-DEV)
- **SETUP-4**: payment gateway (Omise/2C2P/GB Prime Pay) — บล็อก US-06 PromptPay
- **ADR-02** (ค้างแต่ตัดสินโดยพฤตินัยแล้ว): ship **Haversine radius** (`delivery/geo.ts`) ส่วน PostGIS ยังไม่ได้ใช้จริงแม้เปิด extension + เก็บ geometry ไว้แล้ว — ถ้าจะปิด ADR ให้เขียนยืนยันทางที่ใช้อยู่

## การตัดสินใจที่เคาะแล้ว
- ADR-01: **NestJS** (ไม่ใช่ Express เปล่า) — โครงสร้าง module ชัด เหมาะกับ solo dev + AI ทำงานหลาย session
- ADR-04: **monorepo npm workspaces** (เครื่อง dev ไม่มี pnpm) — shared types อยู่ `packages/shared`
- DB: PostgreSQL + **PostGIS** (docker image `postgis/postgis:16-3.4`) + Prisma
- **ADR-0005 tenant schema** (`docs/adr/0005-tenant-schema.md`, Accepted): **Merchant → Brand → Kitchen** — Brand = tenant key ของ app (`brandId`) · Kitchen = จุดผลิต+เขตส่ง+กฎค่าส่ง แชร์หลายแบรนด์ผ่าน `BrandKitchen` (m:n) · เฟส A = 1 Merchant, N Brand, 1 Kitchen · **`schema.prisma` เขียนครบแล้ว 20 models** (ไม่ใช่ไฟล์ว่างอีกต่อไป)
- ADR-03 hosting: **Hetzner Cloud (CX22) + Docker + Caddy** ที่มีอยู่เดิม โดเมน `jivecode.click` — โค้ด/compose/Caddyfile พร้อมแล้ว (`docs/deploy-hetzner.md`) **deploy แล้ว** ที่ `49.13.57.24` (`/opt/aroihoh`) — `aroihoh-api/order/admin.jivecode.click` HTTPS ผ่าน Caddy บน host
- ADR-05: multi-tenant **SaaS-first** (isolate ด้วย merchantId) + dedicated-instance เป็นทางเลือกลูกค้าใหญ่
- ADR-06: LINE OA = **1 Brand : 1 OA** (creds เก็บที่ Brand) — defer LineChannel/shared-OA จนกว่าจะมีดีมานด์
- ADR-07: **House of Brands** (1 แบรนด์ 1 OA แยก identity) + backend รวม
- ⚠️ ADR-05/06/07 ปิดใน PM แล้วแต่**ยังไม่มีไฟล์ใน `docs/adr/`** (มีแค่ 0005) — เนื้อหาอยู่ใน Knowledge Board

## Conventions
- TypeScript strict ทุก workspace
- Branch: `main` = deployable, feature branch ตั้งชื่อตามรหัส story เช่น `us-01-liff-login`
- Commit message อ้างรหัส story/task เช่น `US-06: add promptpay webhook`
- เก็บเงินเป็นหน่วยย่อย (สตางค์/integer) ไม่ใช้ float
