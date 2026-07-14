-- US-45: roles เจาะจง kitchen (KDS) + chat_agent (แชต)
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'kitchen';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'chat_agent';
