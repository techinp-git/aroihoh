#!/usr/bin/env bash
# AroiHoh — deploy บน VPS โดย "ดึง image จาก GHCR" (ไม่ build บนเครื่อง prod)
#
# ใช้: bash scripts/deploy.sh [TAG]
#   TAG = git sha หรือ 'latest' (ดีฟอลต์ latest) — ต้องตรงกับ tag ที่ CI push ขึ้น GHCR
#
# ทำอะไรบ้าง:
#   1. pull image api + static ตาม TAG
#   2. เอา static (liff/admin) ออกจาก image ไปวางที่ /var/www ให้ Caddy เสิร์ฟ
#   3. up -d (ไม่ --build) แล้ว migrate deploy
#   4. health check + prune image เก่า
#
# ต้อง login GHCR ก่อน (ครั้งเดียว หรือให้ CI ทำผ่าน SSH):
#   echo "$CR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
# หรือทำ package เป็น public แล้วข้าม login ได้

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/aroihoh}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
LIFF_WEBROOT="${LIFF_WEBROOT:-/var/www/aroihoh-liff}"
ADMIN_WEBROOT="${ADMIN_WEBROOT:-/var/www/aroihoh-admin}"
REGISTRY="ghcr.io/techinp-git"

TAG="${1:-${AROIHOH_TAG:-latest}}"
export AROIHOH_TAG="$TAG"   # docker-compose.prod.yml อ่านค่านี้ประกอบ image ref ของ api

cd "$REPO_DIR"

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

echo "▶ deploy AroiHoh — TAG=$TAG"

# 1. ดึง image ใหม่
echo "▶ pull api image (ghcr)…"
dc pull api

STATIC_IMAGE="$REGISTRY/aroihoh-static:$TAG"
echo "▶ pull static image: $STATIC_IMAGE"
docker pull "$STATIC_IMAGE"

# วาง static ลง webroot แบบไม่มีช่วงที่เว็บขาดไฟล์ แล้วเก็บกวาดไฟล์ของ build เก่าให้ด้วย
#   1) ก๊อป assets ใหม่เข้าไปก่อน — ชื่อไฟล์มี hash จึงไม่ชนของเดิม ระหว่างนี้เว็บยังเสิร์ฟ build เก่าได้ครบ
#   2) สลับ index.html ทีเดียวด้วย mv (atomic) → คนที่โหลดหน้าหลังจากนี้ได้ของใหม่ที่ไฟล์ครบแล้ว
#   3) ค่อยลบ asset ที่ build ใหม่ไม่มี
# ⚠ ลบเฉพาะใน assets/ — ชื่อไฟล์ที่นั่นมี hash จึงงอกใหม่ทุกครั้งที่ deploy (เคยค้างสะสมจนมี build เก่าปนอยู่ 8 ชุด)
#   ไฟล์ระดับบนสุด (index.html, โลโก้) ชื่อคงที่ ถูกทับอยู่แล้ว จึงไม่ต้องลบ
sync_webroot() {
  local src="$1" dst="$2" name="$3"

  # กัน build เสีย/ก๊อปไม่ครบ: image ให้มาไม่สมบูรณ์เมื่อไหร่ ห้ามไปแตะของที่ใช้งานอยู่
  if [ ! -s "$src/index.html" ] || [ -z "$(ls -A "$src/assets" 2>/dev/null)" ]; then
    echo "  ✗ $name: static ใน image ไม่สมบูรณ์ (index.html ว่าง หรือไม่มี assets) — ไม่แตะของเดิม" >&2
    return 1
  fi

  # 1) ไฟล์ใหม่ทั้งหมด ยกเว้น index.html
  sudo mkdir -p "$dst/assets"
  sudo cp -r "$src/assets/." "$dst/assets/"
  find "$src" -maxdepth 1 -type f ! -name index.html -exec sudo cp {} "$dst/" ';'

  # 2) สลับ index.html แบบ atomic (mv ในไฟล์ระบบเดียวกัน)
  sudo cp "$src/index.html" "$dst/.index.html.new"
  sudo mv -f "$dst/.index.html.new" "$dst/index.html"

  # 3) ลบ asset ที่ build ใหม่ไม่มีแล้ว
  local removed=0 f
  for f in "$dst"/assets/*; do
    [ -e "$f" ] || continue
    if [ ! -e "$src/assets/$(basename "$f")" ]; then
      sudo rm -rf "$f"
      removed=$((removed + 1))
    fi
  done
  echo "  ✓ $name: อัปเดตแล้ว · ลบ asset ของ build เก่า $removed ไฟล์"
}

# 2. เอา static ออกจาก image ไปวางที่ webroot
#    docker cp ออกมาที่ staging ก่อน แล้วค่อย sudo cp เข้า webroot (docker cp pipe ตรงไป sudo ไม่ได้)
echo "▶ วาง static → $LIFF_WEBROOT , $ADMIN_WEBROOT"
sudo mkdir -p "$LIFF_WEBROOT" "$ADMIN_WEBROOT"
STAGE="$(mktemp -d)"
tmp_cid="$(docker create "$STATIC_IMAGE")"
trap 'docker rm -f "$tmp_cid" >/dev/null 2>&1 || true; rm -rf "$STAGE"' EXIT
docker cp "$tmp_cid:/www/liff/."  "$STAGE/liff"
docker cp "$tmp_cid:/www/admin/." "$STAGE/admin"
sync_webroot "$STAGE/liff"  "$LIFF_WEBROOT"  "liff (หน้าลูกค้า)"
sync_webroot "$STAGE/admin" "$ADMIN_WEBROOT" "admin (หลังร้าน)"
docker rm -f "$tmp_cid" >/dev/null 2>&1 || true
rm -rf "$STAGE"
trap - EXIT

# ตรวจว่า VITE_LIFF_ID ฝังเข้า bundle จริง (ลืม = LIFF ตกไป dev-login → 403)
if grep -rqE "liff\.line\.me|liffId" "$LIFF_WEBROOT/assets/" 2>/dev/null; then
  echo "  ✓ LIFF bundle ดูมี liff config"
else
  echo "  ⚠ เตือน: ไม่พบร่องรอย liff ใน bundle — เช็ค VITE_LIFF_ID ตอน build image"
fi

# 3. รีสตาร์ต api ด้วย image ใหม่ (ไม่ build) + migrate
echo "▶ up -d api (ใช้ image ที่ pull มา)…"
dc up -d api postgres redis

echo "▶ prisma migrate deploy…"
dc exec -T api npx prisma migrate deploy

# 4. health check
echo "▶ health check…"
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "  ✓ /api/health OK"
    break
  fi
  if [ "$i" = "15" ]; then
    echo "  ✗ health check ไม่ผ่านใน 15 ครั้ง — ดู logs: dc logs api" >&2
    exit 1
  fi
  sleep 2
done

# 5. เก็บกวาด image เก่าที่ไม่ถูกใช้
echo "▶ docker image prune…"
docker image prune -f >/dev/null 2>&1 || true

echo "✅ deploy สำเร็จ (TAG=$TAG)"
