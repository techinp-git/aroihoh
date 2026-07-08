# AroiHoh 🍚 (Brand.Delivery)

ระบบสั่งอาหาร/เดลิเวอรีผ่าน LINE OA + LIFF — สั่งตรง ไม่เสีย GP

## โครงสร้าง

```
apps/
  api/      NestJS backend (REST /api, LINE webhook, Prisma+PostGIS, BullMQ)
  liff/     LIFF app ฝั่งลูกค้า (React + Vite, port 5173)
  admin/    Admin web ฝั่งร้าน (React + Vite, port 5174)
packages/
  shared/   types/constants ใช้ร่วมทุก app
```

## เริ่มต้น

```bash
cp .env.example .env        # แล้วเติมค่า LINE keys เมื่อได้จาก SETUP-1
npm install
npm run db:up               # Postgres (PostGIS) + Redis
npm run build               # build ทั้งหมด (shared → api → liff → admin)
npm run dev:api             # http://localhost:3000/api/health
npm run dev:liff            # http://localhost:5173
npm run dev:admin           # http://localhost:5174
```

รายละเอียด architecture, กติกา, และการตัดสินใจที่ค้างอยู่ → [CLAUDE.md](CLAUDE.md)
