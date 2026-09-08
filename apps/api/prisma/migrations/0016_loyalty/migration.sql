-- US-50 (EP-14): แกนสะสมแต้ม — QR สแกนได้แต้ม + คูปองแลกแต้ม
--
-- แหล่งความจริงของยอดแต้มคือ loyalty_transactions (append-only ledger)
-- ส่วน customers."pointsBalance" เป็น cache ที่ต้องอัปเดตใน transaction เดียวกับ ledger เสมอ
-- invariant: pointsBalance = SUM(loyalty_transactions.points) และห้ามติดลบ
-- (บังคับตอน redeem ด้วย conditional UPDATE ... WHERE "pointsBalance" >= cost)
--
-- แต้มแยกต่อแบรนด์ (ADR-07 House of Brands) — ทุกตารางมี brandId ตามกติกาเหล็ก #1

CREATE TYPE "LoyaltyBatchStatus" AS ENUM ('draft', 'active', 'revoked');
CREATE TYPE "LoyaltyCodeStatus" AS ENUM ('active', 'used', 'revoked');
CREATE TYPE "LoyaltyRewardType" AS ENUM ('free_item', 'discount');
CREATE TYPE "LoyaltyRedemptionStatus" AS ENUM ('pending', 'confirmed', 'expired', 'cancelled');
CREATE TYPE "LoyaltyTxType" AS ENUM ('earn', 'redeem', 'adjust', 'expire');

-- ล็อตสติกเกอร์ QR ที่ admin สั่งพิมพ์ (draft จนของถึงร้านแล้วค่อยเปิดใช้ — กันสแกนตั้งแต่โรงพิมพ์)
CREATE TABLE "loyalty_qr_batches" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "menuItemId" TEXT,
    "points" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "LoyaltyBatchStatus" NOT NULL DEFAULT 'draft',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_qr_batches_pkey" PRIMARY KEY ("id")
);

-- QR 1 ใบ = 1 แถว ใช้ได้ครั้งเดียว (status active → used ด้วย conditional update)
CREATE TABLE "loyalty_qr_codes" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "LoyaltyCodeStatus" NOT NULL DEFAULT 'active',
    "usedByCustomerId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_qr_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "type" "LoyaltyRewardType" NOT NULL DEFAULT 'free_item',
    "menuItemId" TEXT,
    "discountAmount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- คูปองที่ลูกค้าขอไว้ — ยังไม่ตัดแต้มจนกว่าคนขายจะกดยืนยัน (status = confirmed)
CREATE TABLE "loyalty_redemptions" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardName" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "LoyaltyRedemptionStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedByAdminId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id")
);

-- ledger append-only — ห้าม update/delete แถวเก่า ทุกการเปลี่ยนแต้มต้องมีแถวที่นี่
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoyaltyTxType" NOT NULL,
    "points" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- cache ของ SUM(ledger) — อัปเดตพร้อม ledger ใน transaction เดียวเสมอ
ALTER TABLE "customers" ADD COLUMN "pointsBalance" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "loyalty_qr_codes_code_key" ON "loyalty_qr_codes"("code");
CREATE UNIQUE INDEX "loyalty_redemptions_token_key" ON "loyalty_redemptions"("token");
CREATE INDEX "loyalty_qr_batches_brandId_status_idx" ON "loyalty_qr_batches"("brandId", "status");
CREATE INDEX "loyalty_qr_codes_batchId_status_idx" ON "loyalty_qr_codes"("batchId", "status");
CREATE INDEX "loyalty_qr_codes_brandId_usedByCustomerId_idx" ON "loyalty_qr_codes"("brandId", "usedByCustomerId");
CREATE INDEX "loyalty_rewards_brandId_isActive_idx" ON "loyalty_rewards"("brandId", "isActive");
CREATE INDEX "loyalty_redemptions_brandId_status_idx" ON "loyalty_redemptions"("brandId", "status");
CREATE INDEX "loyalty_redemptions_customerId_status_idx" ON "loyalty_redemptions"("customerId", "status");
CREATE INDEX "loyalty_transactions_customerId_createdAt_idx" ON "loyalty_transactions"("customerId", "createdAt");
CREATE INDEX "loyalty_transactions_brandId_createdAt_idx" ON "loyalty_transactions"("brandId", "createdAt");

ALTER TABLE "loyalty_qr_batches" ADD CONSTRAINT "loyalty_qr_batches_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_qr_codes" ADD CONSTRAINT "loyalty_qr_codes_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_qr_codes" ADD CONSTRAINT "loyalty_qr_codes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "loyalty_qr_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_qr_codes" ADD CONSTRAINT "loyalty_qr_codes_usedByCustomerId_fkey" FOREIGN KEY ("usedByCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "loyalty_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
