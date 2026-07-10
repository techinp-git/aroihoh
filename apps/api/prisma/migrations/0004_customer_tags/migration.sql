-- US-21: แท็กลูกค้า
ALTER TABLE "customers" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
