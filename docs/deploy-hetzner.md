# Deploy AroiHoh บน Hetzner Cloud (Caddy เดิม + Docker)

สถาปัตยกรรม: 1 เครื่อง Hetzner Cloud
- **Caddy** (มีอยู่แล้ว บน host) → reverse proxy + HTTPS อัตโนมัติ
- **Docker Compose** (เพิ่มใหม่) → API (NestJS) + Postgres(PostGIS)
- **Static** LIFF/Admin → build แล้วเสิร์ฟผ่าน Caddy เดิม

โดเมน:
| subdomain | ชี้ไป |
|---|---|
| `api.jivecode.click` | API container (127.0.0.1:3000) |
| `order.jivecode.click` | `/var/www/aroihoh-liff` (LIFF) |
| `admin.jivecode.click` | `/var/www/aroihoh-admin` (Admin) |

---

## 0. เตรียม (ฝั่ง Hetzner + DNS) — ทำครั้งเดียว

1. **สร้าง Cloud Server**: type **CX22** (2 vCPU / 4GB), location **Singapore**, image Ubuntu 24.04
2. **DNS** (ที่ผู้ให้บริการโดเมน jivecode.click): เพิ่ม A record ชี้มาที่ IP เครื่อง
   ```
   api.jivecode.click     A   <SERVER_IP>
   order.jivecode.click   A   <SERVER_IP>
   admin.jivecode.click   A   <SERVER_IP>
   ```
3. **Hetzner Cloud Firewall** (ฟรี): เปิดเฉพาะ 22 (SSH), 80, 443 — ปิดที่เหลือ
4. ลง Docker (ถ้ายังไม่มี — แต่มี project อื่นรัน Docker อยู่แล้วน่าจะมี):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

## 1. เอาโค้ดขึ้นเครื่อง

```bash
cd /opt          # หรือที่ไหนก็ได้ที่คุณจัดระเบียบ project
git clone git@github.com:techinp-git/aroihoh.git
cd aroihoh
```

## 2. ตั้งค่า env

```bash
cp .env.prod.example .env.prod
nano .env.prod        # เติมค่าจริงทุก __CHANGE_ME__
```
ค่าที่ **ต้อง** เปลี่ยน: `POSTGRES_PASSWORD` (+ ให้ตรงใน `DATABASE_URL`), `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ENCRYPTION_KEY` (สุ่มด้วย `openssl rand -hex 32` คนละค่า), `ADMIN_SEED_PASSWORD`

> ⚠️ **`ENCRYPTION_KEY` ต้องตั้งก่อนเสียบ LINE keys ครั้งแรก** (SEC-1 เข้ารหัส channel secret/token at-rest)
> ตั้งทีหลังหรือเปลี่ยนคีย์หลังมีข้อมูลแล้ว = **ถอดรหัสของเดิมไม่ออก** ต้องกรอก LINE keys ใหม่ทุกแบรนด์
>
> ⚠️ **`REDIS_URL` ต้องตั้ง** (`redis://redis:6379`) ไม่งั้นคิว push (US-09) จะ fallback เป็นโหมด inline เงียบ ๆ —
> ส่งได้แต่ไม่มี retry/backoff ตอน LINE rate limit

## 3. รัน API + DB

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
ตรวจว่าขึ้น: `docker compose -f docker-compose.prod.yml ps` — ควรเห็น postgres (healthy) + redis (healthy) + api (up)

ตรวจว่าคิว push ต่อ Redis ได้จริง (ไม่ใช่ fallback inline):
```bash
docker compose -f docker-compose.prod.yml logs api | grep -i "line-notify\|REDIS_URL"
```
เห็น `คิว line-notify พร้อม (Redis)` = ถูกต้อง · เห็น `ไม่มี REDIS_URL — โหมด inline` = ยังไม่ได้ตั้ง `REDIS_URL`

## 4. Migrate DB (+ seed ครั้งแรกเท่านั้น)

```bash
# สร้างตารางทั้งหมดจาก migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# seed แบรนด์ชิมชีวา + เมนู + owner admin — รันครั้งแรกครั้งเดียว!
# (ครั้งต่อไปห้ามรันซ้ำ ถ้ามีข้อมูลจริงแล้ว)
docker compose -f docker-compose.prod.yml exec api npx ts-node prisma/seed.ts
```

ตรวจ API: `curl http://127.0.0.1:3000/api/health` → ควรได้ 200

## 5. Build static (LIFF/Admin) แล้ววางให้ Caddy

```bash
# ตั้ง env build ให้ชี้ API จริง (Vite ฝังตอน build)
export VITE_API_BASE_URL=https://api.jivecode.click
export VITE_LIFF_ID=<LIFF ID ของแบรนด์>   # ดูขั้น 7

npm ci
npm run build -w packages/shared
npm run build -w apps/liff
npm run build -w apps/admin

sudo mkdir -p /var/www/aroihoh-liff /var/www/aroihoh-admin
sudo cp -r apps/liff/dist/*  /var/www/aroihoh-liff/
sudo cp -r apps/admin/dist/* /var/www/aroihoh-admin/
```
> LIFF ต้องรู้ `brandId` — ตั้งใน LIFF Endpoint URL เป็น `https://order.jivecode.click/?brandId=<id>` (ดูขั้น 7) ไม่ต้อง build ใหม่ต่อแบรนด์

## 6. ต่อ Caddy (host)

เอาเนื้อหาใน [`deploy/Caddyfile.snippet`](../deploy/Caddyfile.snippet) ไปเพิ่มใน Caddyfile เดิม (ปกติ `/etc/caddy/Caddyfile`) แล้ว:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
เช็ค: เปิด `https://api.jivecode.click/api/health` ในเบราว์เซอร์ → 200 + มี HTTPS (กุญแจเขียว)

## 7. ต่อ LINE OA (ใช้ค่าจริง)

ในหน้า Admin (`https://admin.jivecode.click`) → ตั้งค่า → เชื่อมต่อ LINE OA (owner):
- Webhook URL: `https://api.jivecode.click/api/line/webhook/<brandId>`
- เสียบ Channel ID / secret / access token / LIFF ID
- ใน LINE Developers Console: ตั้ง LIFF Endpoint URL = `https://order.jivecode.click/?brandId=<brandId>`

---

## Deploy รอบถัดไป (มีโค้ดใหม่)

```bash
cd /opt/aroihoh && git pull
# API:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy   # ถ้ามี migration ใหม่
# Static (ถ้าแก้ liff/admin):
npm ci && npm run build -w packages/shared && npm run build -w apps/liff -w apps/admin
sudo cp -r apps/liff/dist/*  /var/www/aroihoh-liff/
sudo cp -r apps/admin/dist/* /var/www/aroihoh-admin/
```

## Backup DB (สำคัญ — Hetzner ไม่ auto ให้เหมือน managed)

```bash
# ตั้ง cron รายวัน (crontab -e)
0 3 * * * docker compose -f /opt/aroihoh/docker-compose.prod.yml exec -T postgres pg_dump -U aroihoh aroihoh | gzip > /opt/backups/aroihoh-$(date +\%F).sql.gz
```
+ เปิด Hetzner snapshot/backup ของ volume เป็นชั้นสอง

## หมายเหตุ

- **ถ้า Caddy รันใน Docker** (ไม่ใช่ host): `localhost:3000` เข้าไม่ถึง — ให้ต่อ network ร่วมแล้วใช้ `reverse_proxy aroihoh-api:3000` (บอกทีมได้ เดี๋ยวปรับ compose ให้ join network เดิม)
- **โควตา push LINE แยกต่อ OA** — หลายแบรนด์ = หลาย OA = โควตาเพิ่ม
- ล็อกแล้ว: `CORS_ORIGINS` อนุญาตเฉพาะ order./admin. · `ALLOW_DEV_LOGIN` ปิด · Postgres ไม่เปิด port ออกเน็ต · API เปิดแค่ 127.0.0.1
