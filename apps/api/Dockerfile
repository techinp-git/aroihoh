# AroiHoh API — multi-stage build สำหรับ monorepo (npm workspaces)
# builder: ลง deps ทั้งหมด → build packages/shared → build apps/api (prisma generate + nest build)
# runner : เอาเฉพาะ dist + node_modules (มี prisma CLI ไว้ migrate deploy ใน container ได้)

FROM node:20-slim AS builder
WORKDIR /app
# libssl/openssl จำเป็นสำหรับ prisma engine ตอน generate
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# copy manifest ก่อน เพื่อใช้ layer cache ของ npm ci
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci

# copy source แล้ว build (shared ต้องมาก่อนเสมอ — api import @aroihoh/shared)
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
  && npm run build -w apps/api

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# node_modules ทั้งชุด (รวม prisma CLI + generated client) — symlink @aroihoh/shared ยังชี้ไป ../../packages/shared
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 3000
# migrate deploy รันแยกตอน deploy (ดู docs/deploy-hetzner.md) — start แค่รันเซิร์ฟเวอร์
CMD ["node", "dist/main.js"]
