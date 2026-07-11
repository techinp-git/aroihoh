-- US-09/reply-optimize: บันทึกช่องทางส่ง (reply ฟรี / push นับโควตา) + type ใหม่

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'auto_reply';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'chat';

CREATE TYPE "MessageChannel" AS ENUM ('reply', 'push');

ALTER TABLE "message_logs" ADD COLUMN "channel" "MessageChannel";
