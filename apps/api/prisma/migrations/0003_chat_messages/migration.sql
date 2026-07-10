-- US-21 Chat Center
CREATE TYPE "ChatDirection" AS ENUM ('inbound', 'outbound');

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "direction" "ChatDirection" NOT NULL,
  "text" TEXT NOT NULL,
  "adminId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_brandId_customerId_createdAt_idx" ON "chat_messages"("brandId", "customerId", "createdAt");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
