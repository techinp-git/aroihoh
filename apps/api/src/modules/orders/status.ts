/**
 * US-12: state machine ของสถานะออเดอร์ — pure, unit-testable
 * กติกา: เดินหน้าได้ทีละขั้นตาม ORDER_STATUS_FLOW · ยกเลิกได้จากสถานะที่ยังไม่ terminal (ต้องมีเหตุผล)
 */
import { ORDER_STATUS_FLOW, type OrderStatus } from '@aroihoh/shared';

export function isTerminal(s: OrderStatus): boolean {
  return s === 'completed' || s === 'cancelled';
}

/** สถานะถัดไปตามลำดับ (null ถ้าเป็นขั้นสุดท้าย/terminal) */
export function nextStatus(current: OrderStatus): OrderStatus | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(current);
  if (i < 0 || i >= ORDER_STATUS_FLOW.length - 1) return null;
  return ORDER_STATUS_FLOW[i + 1];
}

/** อนุญาตเปลี่ยน from → to ไหม */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (isTerminal(from)) return false; // จบแล้วเปลี่ยนต่อไม่ได้
  if (to === 'cancelled') return true; // ยกเลิกได้ทุกสถานะที่ยังไม่จบ
  return to === nextStatus(from); // เดินหน้าทีละขั้น ห้ามข้าม/ถอยหลัง
}
