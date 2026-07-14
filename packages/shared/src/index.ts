/**
 * Shared types & constants — ใช้ร่วมกันระหว่าง api / liff / admin
 * ห้ามใส่ business logic ที่มีผลต่อเงิน (ค่าส่ง/ราคา) ที่นี่ — คำนวณฝั่ง server เท่านั้น
 */

/** ลำดับสถานะออเดอร์ (US-12: เปลี่ยนสถานะต้องไล่ตามลำดับ) */
export const ORDER_STATUS_FLOW = [
  'pending', // รอยืนยัน/รอชำระ
  'confirmed', // ร้านรับออเดอร์ (US-42: พิมพ์ใบครัว)
  'preparing', // กำลังทำ
  'ready', // US-41: ครัวจัดเสร็จ รอไรเดอร์ (US-43: พิมพ์ label)
  'delivering', // ออกส่ง (ไรเดอร์รับแล้ว)
  'completed', // ส่งสำเร็จ
] as const;

export type OrderStatus = (typeof ORDER_STATUS_FLOW)[number] | 'cancelled';

export type PaymentMethod = 'promptpay' | 'cod';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'expired' | 'refunded';

/** ประเภทเขตจัดส่ง (US-15) */
export type DeliveryZoneType = 'radius' | 'polygon';

/** กฎค่าส่ง (US-15) */
export type FeeRuleType = 'flat' | 'tiered' | 'per_km';

export interface DeliveryCheckRequest {
  lat: number;
  lng: number;
}

export interface DeliveryCheckResult {
  inZone: boolean;
  distanceKm?: number;
  deliveryFee?: number; // สตางค์/หน่วยย่อย — server เป็นคนคำนวณเสมอ
  reason?: string;
}
