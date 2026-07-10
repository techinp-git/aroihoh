import { ForbiddenException } from '@nestjs/common';
import type { AdminJwt } from './guards/admin-jwt.guard';

/**
 * กันข้ามแบรนด์ (cross-tenant): admin เข้าถึงได้เฉพาะแบรนด์ใน brandIds ของตัวเอง
 * brandId ต้องมาจาก request แต่ต้องผ่านการตรวจนี้เสมอ — ห้ามเชื่อ query param ตรง ๆ
 */
export function assertBrandAccess(admin: AdminJwt, brandId: string): void {
  if (!brandId || !admin.brandIds.includes(brandId)) {
    throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงแบรนด์นี้');
  }
}
