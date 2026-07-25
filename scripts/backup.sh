#!/usr/bin/env bash
# AroiHoh — backup รายวัน: DB (pg_dump) + รูปแชต (Docker volume mediadata)
# ตั้ง cron: 0 3 * * * /opt/aroihoh/scripts/backup.sh >> /opt/backups/backup.log 2>&1
# กู้คืน DB:  gunzip -c aroihoh-db-YYYY-MM-DD.sql.gz | docker compose ... exec -T postgres psql -U aroihoh -d aroihoh
# กู้คืนรูป:  docker run --rm -v aroihoh_mediadata:/media -v /opt/backups:/b alpine \
#            sh -c 'tar xzf /b/aroihoh-media-YYYY-MM-DD.tar.gz -C /media'
set -euo pipefail

APP_DIR=/opt/aroihoh
BK=/opt/backups
DATE=$(date +%F)
RETENTION_DAYS=14
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --env-file $APP_DIR/.env.prod"

mkdir -p "$BK"

# 1) DB — pg_dump ผ่าน container postgres (ไม่ได้เปิด port ออกนอก)
$COMPOSE exec -T postgres pg_dump -U aroihoh aroihoh | gzip > "$BK/aroihoh-db-$DATE.sql.gz"

# 2) รูปแชต — tar ทั้ง volume ผ่าน throwaway container (read-only mount)
docker run --rm -v aroihoh_mediadata:/media:ro -v "$BK":/backup alpine \
  tar czf "/backup/aroihoh-media-$DATE.tar.gz" -C /media . 2>/dev/null || \
  echo "[warn] media backup ข้าม (volume ว่าง/ไม่มี)"

# 3) retention — ลบ backup เก่ากว่า N วัน
find "$BK" -name 'aroihoh-db-*.sql.gz' -mtime +$RETENTION_DAYS -delete
find "$BK" -name 'aroihoh-media-*.tar.gz' -mtime +$RETENTION_DAYS -delete

echo "[$(date '+%F %T')] backup done — db+media (retention ${RETENTION_DAYS}d)"
