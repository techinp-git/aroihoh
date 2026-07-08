/**
 * คิดยอดออเดอร์ — pure, หน่วยสตางค์ ทั้งหมด
 * กติกาเหล็ก: ยอดเงินคำนวณฝั่ง server เท่านั้น ห้ามเชื่อค่าจาก client
 */

export interface PricingItem {
  unitPrice: number;
  qty: number;
}

export interface OrderPricing {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export function lineTotal(item: PricingItem): number {
  return item.unitPrice * item.qty;
}

export function computeOrderPricing(
  items: PricingItem[],
  deliveryFee = 0,
  discount = 0,
): OrderPricing {
  const subtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  return { subtotal, deliveryFee, discount, total };
}
