-- US-18: LINE broadcast + PDPA opt-out

-- PDPA: ลูกค้า opt-out รับข่าวสาร/broadcast
ALTER TABLE "customers" ADD COLUMN "marketingOptedOut" BOOLEAN NOT NULL DEFAULT false;

-- แคมเปญ broadcast
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'queued', 'sending', 'sent', 'failed');

CREATE TABLE "broadcasts" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "segment" JSONB,
  "status" "BroadcastStatus" NOT NULL DEFAULT 'draft',
  "audienceCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "broadcasts_brandId_createdAt_idx" ON "broadcasts" ("brandId", "createdAt");

ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
