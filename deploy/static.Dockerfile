# AroiHoh static (LIFF + Admin) — build บน CI แล้วฝัง VITE_* ตอน build
# ผลลัพธ์เป็น image เล็ก ๆ (busybox) ที่มี /www/liff และ /www/admin
# ตอน deploy สคริปต์จะ `docker cp` เนื้อในออกไปวางที่ /var/www ให้ Caddy บน host เสิร์ฟ
#
# ⚠️ VITE_* ฝังตอน build เท่านั้น (เปลี่ยนค่าทีหลัง = ต้อง build image ใหม่)
#    ลืม VITE_LIFF_ID = LIFF ตกไปใช้ dev-login → prod 403 (ดู CLAUDE.md)
#
# หมายเหตุ: build ด้วย context = repo root แต่ root .dockerignore ตัด apps/liff, apps/admin ทิ้ง
#          จึงมี deploy/static.Dockerfile.dockerignore (BuildKit ใช้ไฟล์นี้แทน root) ให้ copy เข้ามาได้

FROM node:20-slim AS builder
WORKDIR /app

# manifest ก่อน เพื่อ cache layer ของ npm ci (ต้องมี package.json ครบทุก workspace ที่ glob ชี้ถึง)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/liff/package.json apps/liff/
COPY apps/admin/package.json apps/admin/
RUN npm ci

# source (shared ต้อง build ก่อน — liff/admin import @aroihoh/shared)
COPY packages/shared packages/shared
COPY apps/liff apps/liff
COPY apps/admin apps/admin

# VITE_* ส่งเข้ามาเป็น build-arg จาก CI (ดู .github/workflows/deploy.yml)
ARG VITE_API_BASE_URL
ARG VITE_LIFF_ID
ARG VITE_PRIVACY_URL
ARG VITE_BRAND_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_LIFF_ID=$VITE_LIFF_ID \
    VITE_PRIVACY_URL=$VITE_PRIVACY_URL \
    VITE_BRAND_ID=$VITE_BRAND_ID

RUN npm run build -w packages/shared \
  && npm run build -w apps/liff \
  && npm run build -w apps/admin

# image ปลายทางเล็กสุด — แค่เก็บ dist ไว้ให้ deploy.sh docker cp ออกไป
FROM busybox:1.36
COPY --from=builder /app/apps/liff/dist  /www/liff
COPY --from=builder /app/apps/admin/dist /www/admin
