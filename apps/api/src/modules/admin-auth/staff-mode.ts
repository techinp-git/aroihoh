import type { AdminRole } from '../../common/guards/admin-jwt.guard';

/**
 * US-61 "โหมดพนักงาน" ใน LIFF — ตัดสินว่าบัญชีแอดมินที่เพิ่งล็อกอินผ่าน LINE
 * เห็นหน้าสแกนแลกแต้มของแบรนด์นี้ได้ไหม
 *
 * เป็น logic ล้วน ๆ ให้ทั้ง API และ LIFF ใช้คำตอบเดียวกัน (LIFF ไม่คิดเอง)
 * ตัวจริงที่กันคือ @Roles + assertBrandAccess ที่ endpoint ยืนยันคูปอง — ตัวนี้แค่บอก UI
 * ว่าจะโชว์แท็บไหม จะได้ไม่มีปุ่มที่กดแล้ว 403
 */

/** role ที่กดยืนยันคูปองได้ — ต้องตรงกับ @Roles ของ admin-loyalty.controller */
export const SCAN_ROLES: readonly AdminRole[] = ['owner', 'manager', 'staff'];

export function hasBrandAccess(brandIds: string[], brandId: string): boolean {
  return !!brandId && brandIds.includes(brandId);
}

export function canScanRedemptions(
  role: AdminRole,
  brandIds: string[],
  brandId: string,
): boolean {
  return SCAN_ROLES.includes(role) && hasBrandAccess(brandIds, brandId);
}
