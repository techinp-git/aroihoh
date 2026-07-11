-- US-18: Content Library + Saved Audiences (dynamic segment) + wire into broadcasts

CREATE TABLE "content_library" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_library_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "content_library_brandId_createdAt_idx" ON "content_library" ("brandId", "createdAt");
ALTER TABLE "content_library" ADD CONSTRAINT "content_library_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audiences" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "rules" JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audiences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audiences_brandId_createdAt_idx" ON "audiences" ("brandId", "createdAt");
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- broadcasts อ้าง content + audience
ALTER TABLE "broadcasts" ADD COLUMN "contentId" TEXT;
ALTER TABLE "broadcasts" ADD COLUMN "audienceId" TEXT;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_contentId_fkey"
  FOREIGN KEY ("contentId") REFERENCES "content_library" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "audiences" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
