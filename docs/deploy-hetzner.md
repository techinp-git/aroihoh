# Deploy AroiHoh บน Hetzner Cloud (Caddy เดิม + Docker)

สถาปัตยกรรม: 1 เครื่อง Hetzner Cloud
- **Caddy** (มีอยู่แล้ว บน host) → reverse proxy + HTTPS อัตโนมัติ
- **Docker Compose** (เพิ่มใหม่) → API (NestJS) + Postgres(PostGIS)
- **Static** LIFF/Admin → build แล้วเสิร์ฟผ่าน Caddy เดิม

โดเมน:
| subdomain | ชี้ไป |
|---|---|
| `aroihoh-api.jivecode.click` | API container (127.0.0.1:3000) |
| `aroihoh-order.jivecode.click` | `/var/www/aroihoh-liff` (LIFF) |
| `aroihoh-admin.jivecode.click` | `/var/www/aroihoh-admin` (Admin) |

---

## 0. เตรียม (ฝั่ง Hetzner + DNS) — ทำครั้งเดียว

1. **สร้าง Cloud Server**: type **CX22** (2 vCPU / 4GB), location **Singapore**, image Ubuntu 24.04
2. **DNS** (ที่ผู้ให้บริการโดเมน jivecode.click): เพิ่ม A record ชี้มาที่ IP เครื่อง
   ```
   aroihoh-api.jivecode.click     A   <SERVER_IP>
   aroihoh-order.jivecode.click   A   <SERVER_IP>
   aroihoh-admin.jivecode.click   A   <SERVER_IP>
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
export VITE_API_BASE_URL=https://aroihoh-api.jivecode.click/api   # ⚠️ ต้องมี /api ต่อท้าย
export VITE_LIFF_ID=<LIFF ID ของแบรนด์>   # ดูขั้น 7

npm ci
npm run build -w packages/shared
npm run build -w apps/liff
npm run build -w apps/admin

sudo mkdir -p /var/www/aroihoh-liff /var/www/aroihoh-admin
sudo cp -r apps/liff/dist/*  /var/www/aroihoh-liff/
sudo cp -r apps/admin/dist/* /var/www/aroihoh-admin/
```
> LIFF ต้องรู้ `brandId` — ตั้งใน LIFF Endpoint URL เป็น `https://aroihoh-order.jivecode.click/?brandId=<id>` (ดูขั้น 7) ไม่ต้อง build ใหม่ต่อแบรนด์

## 6. ต่อ Caddy (host)

เอาเนื้อหาใน [`deploy/Caddyfile.snippet`](../deploy/Caddyfile.snippet) ไปเพิ่มใน Caddyfile เดิม (ปกติ `/etc/caddy/Caddyfile`) แล้ว:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
เช็ค: เปิด `https://aroihoh-api.jivecode.click/api/health` ในเบราว์เซอร์ → 200 + มี HTTPS (กุญแจเขียว)

## 7. ต่อ LINE OA (ใช้ค่าจริง)

ในหน้า Admin (`https://aroihoh-admin.jivecode.click`) → ตั้งค่า → เชื่อมต่อ LINE OA (owner):
- Webhook URL: `https://aroihoh-api.jivecode.click/api/line/webhook/<brandId>`
- เสียบ Channel ID / secret / access token / LIFF ID
- ใน LINE Developers Console: ตั้ง LIFF Endpoint URL = `https://aroihoh-order.jivecode.click/?brandId=<brandId>`

---

## CD อัตโนมัติ (GHCR image + pull) — แนะนำ

แทนที่จะ build บนเครื่อง prod (CX22 RAM 4GB หนัก) ให้ **CI build image แล้ว push ขึ้น GHCR → VPS แค่ pull**
โฟลว์: push `main` → CI (`ci.yml`) ผ่าน → `deploy.yml` build 2 image (`aroihoh-api`, `aroihoh-static`) push GHCR → SSH เข้า VPS รัน `scripts/deploy.sh`

### ตั้งครั้งเดียว (ฝั่ง GitHub repo)

> 📋 checklist ไล่ทีละขั้น (สร้าง SSH key/PAT + คำสั่งเทสต์): [`cd-secrets-checklist.md`](cd-secrets-checklist.md)

**Settings → Secrets and variables → Actions**

Secrets (ความลับ):
| ชื่อ | ค่า |
|---|---|
| `SSH_HOST` | `49.13.57.24` |
| `SSH_USER` | `root` (หรือ user ที่ deploy) |
| `SSH_KEY` | private key (ตัว public key ต้องอยู่ใน `~/.ssh/authorized_keys` บน VPS) |
| `SSH_PORT` | *(ไม่ตั้งก็ได้ = 22)* |
| `CR_PAT` | GitHub PAT (classic) scope **`read:packages`** — VPS ใช้ login GHCR ตอน pull |

Variables (ไม่ลับ — ฝังตอน build static, ต้องมี ไม่งั้น LIFF พัง):
| ชื่อ | ค่า |
|---|---|
| `VITE_API_BASE_URL` | `https://aroihoh-api.jivecode.click/api` (⚠️ ต้องมี `/api`) |
| `VITE_LIFF_ID` | LIFF ID ของแบรนด์ (⚠️ ลืม = LIFF ตกไป dev-login → 403) |
| `VITE_PRIVACY_URL` | URL นโยบายความเป็นส่วนตัว *(เว้นได้ = ไม่โชว์ลิงก์)* |
| `VITE_BRAND_ID` | brandId ดีฟอลต์ *(เว้นได้ ถ้าใช้ `?brandId=` ที่ LIFF endpoint)* |

### ตั้งครั้งเดียว (ฝั่ง VPS)

โค้ดต้องอยู่ที่ `/opt/aroihoh` (มี `.env.prod` ครบตามข้อ 2 ด้านบน) — VPS `git pull` เฉพาะ compose/scripts/migrations ไม่ build
> **package บน GHCR เริ่มต้นเป็น private** → workflow login ให้อัตโนมัติผ่าน `CR_PAT` แล้ว
> ถ้าอยากง่ายกว่า: เปิด package เป็น **public** (GitHub → Packages → package settings → Change visibility) แล้วตัด `CR_PAT` + บรรทัด `docker login` ใน `deploy.yml` ทิ้งได้

### deploy

- **อัตโนมัติ**: push เข้า `main` → CI ผ่าน → deploy เอง
- **กดเอง**: GitHub → Actions → *Deploy* → Run workflow
- **รันบน VPS ตรง ๆ** (ไม่พึ่ง GitHub): `cd /opt/aroihoh && bash scripts/deploy.sh <sha|latest>`
- **rollback**: `bash scripts/deploy.sh <sha เก่า>` (image เก่ายังอยู่บน GHCR ตาม tag sha)

> `deploy.sh` = pull api+static image ตาม tag → `docker cp` static ไป `/var/www` → `up -d` (ไม่ build) → `prisma migrate deploy` → health check `/api/health` → prune
> seed **ไม่อยู่ใน** deploy.sh (กันรันซ้ำทับข้อมูลจริง) — รันมือครั้งแรกครั้งเดียวตามข้อ 4

---

## Deploy รอบถัดไป (แบบ manual — ถ้าไม่ใช้ CD)

```bash
cd /opt/aroihoh && git pull
# API:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy   # ถ้ามี migration ใหม่
# Static (ถ้าแก้ liff/admin) — env ต้องครบ Vite ฝังตอน build ลืมแล้วเงียบ ไม่ error:
export VITE_API_BASE_URL=https://aroihoh-api.jivecode.click/api   # ⚠️ ต้องมี /api
export VITE_LIFF_ID=<LIFF ID ของแบรนด์>                            # ⚠️ ลืม = LIFF ตกไปใช้ dev-login → 403
npm ci && npm run build -w packages/shared && npm run build -w apps/liff -w apps/admin
sudo cp -r apps/liff/dist/*  /var/www/aroihoh-liff/
sudo cp -r apps/admin/dist/* /var/www/aroihoh-admin/

# ตรวจว่า env ฝังเข้า bundle จริง (ไม่ใช่แค่ export แล้วคิดว่าติด)
grep -c "$VITE_LIFF_ID" /var/www/aroihoh-liff/assets/*.js     # ต้อง > 0
grep -o "https://aroihoh-api[^\"]*" /var/www/aroihoh-admin/assets/*.js | head -1
```

> ค่าพวกนี้เก็บไว้ใน `.env.prod` ได้ แล้ว `set -a && . .env.prod && set +a` ก่อน build จะได้ไม่ต้องจำ

## Backup (สำคัญ — Hetzner ไม่ auto ให้เหมือน managed)

`scripts/backup.sh` สำรอง **DB (pg_dump) + รูปแชต (volume `mediadata`)** → `/opt/backups` · retention 14 วัน
```bash
# ติดตั้ง cron ตี 3 ทุกวัน (ทำครั้งเดียว)
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/aroihoh/scripts/backup.sh >> /opt/backups/backup.log 2>&1" ) | crontab -

# PDPA: ลบข้อมูลที่หมดอายุตามนโยบาย ตี 4 ทุกวัน (หลัง backup เสร็จ — จะได้มีสำเนาก่อนลบ)
# ลองแบบ dry-run ก่อนเสมอ (ตัด --apply ออก) แล้วอ่านว่าจะแตะข้อมูลกี่รายการ:
#   docker compose exec -T api node dist/modules/pdpa/retention.cli.js
( crontab -l 2>/dev/null; echo "0 4 * * * cd /opt/aroihoh && docker compose exec -T api node dist/modules/pdpa/retention.cli.js --apply >> /root/pdpa-retention.log 2>&1" ) | crontab -
/opt/aroihoh/scripts/backup.sh   # รันมือทดสอบ 1 รอบ
```
วิธีกู้คืนอยู่หัวไฟล์ `scripts/backup.sh` · + เปิด Hetzner snapshot ของ disk เป็นชั้นสอง

## หมุนคีย์เข้ารหัส (ENCRYPTION_KEY rotation)

⚠️ **ห้ามแก้ `ENCRYPTION_KEY` ใน `.env.prod` ตรง ๆ** — LINE secret/token เข้ารหัสด้วยคีย์เดิม ถอดไม่ออกทันที
ใช้ `prisma/rotate-encryption-key.ts` (decrypt คีย์เก่า → re-encrypt คีย์ใหม่ ไม่ต้องกรอก LINE keys ใหม่):
```bash
cd /opt/aroihoh && NEW=$(openssl rand -hex 32)
docker cp apps/api/prisma/rotate-encryption-key.ts aroihoh-api:/app/apps/api/prisma/
docker exec -e NEWKEY="$NEW" -w /app/apps/api aroihoh-api sh -c \
  'OLD_ENCRYPTION_KEY="$ENCRYPTION_KEY" ENCRYPTION_KEY="$NEWKEY" npx ts-node -O "{\"module\":\"commonjs\"}" prisma/rotate-encryption-key.ts'
# rotate สำเร็จค่อย: อัปเดต .env.prod (ENCRYPTION_KEY=$NEW บรรทัดสะอาด ไม่มี comment ต่อท้าย) + up -d
```
> `ENCRYPTION_KEY` ต้องเป็น **hex ล้วนบรรทัดเดียว ห้ามมี `#`/วงเล็บ/ช่องว่างต่อท้าย** — ไม่งั้น `. .env.prod` (shell source) พัง

## หมายเหตุ

- **ถ้า Caddy รันใน Docker** (ไม่ใช่ host): `localhost:3000` เข้าไม่ถึง — ให้ต่อ network ร่วมแล้วใช้ `reverse_proxy aroihoh-api:3000` (บอกทีมได้ เดี๋ยวปรับ compose ให้ join network เดิม)
- **โควตา push LINE แยกต่อ OA** — หลายแบรนด์ = หลาย OA = โควตาเพิ่ม
- ล็อกแล้ว: `CORS_ORIGINS` อนุญาตเฉพาะ order./admin. · `ALLOW_DEV_LOGIN` ปิด · Postgres ไม่เปิด port ออกเน็ต · API เปิดแค่ 127.0.0.1
