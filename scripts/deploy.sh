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

# 2. เอา static ออกจาก image ไปวางที่ webroot
#    docker cp ออกมาที่ staging ก่อน แล้วค่อย sudo cp เข้า webroot (docker cp pipe ตรงไป sudo ไม่ได้)
echo "▶ วาง static → $LIFF_WEBROOT , $ADMIN_WEBROOT"
sudo mkdir -p "$LIFF_WEBROOT" "$ADMIN_WEBROOT"
STAGE="$(mktemp -d)"
tmp_cid="$(docker create "$STATIC_IMAGE")"
trap 'docker rm -f "$tmp_cid" >/dev/null 2>&1 || true; rm -rf "$STAGE"' EXIT
docker cp "$tmp_cid:/www/liff/."  "$STAGE/liff"
docker cp "$tmp_cid:/www/admin/." "$STAGE/admin"
sudo cp -r "$STAGE/liff/."  "$LIFF_WEBROOT/"
sudo cp -r "$STAGE/admin/." "$ADMIN_WEBROOT/"
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
