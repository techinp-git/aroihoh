/** สรุปสถิติลูกค้าจากประวัติออเดอร์ — pure, unit-testable */

export interface OrderForStats {
  status: string;
  total: number;
  createdAt: string | Date;
}

export interface CustomerStats {
  orderCount: number; // ออเดอร์ทั้งหมด (รวมยกเลิก)
  totalSpent: number; // ยอดใช้จ่ายรวม (ไม่รวมยกเลิก, สตางค์)
  lastOrderAt: string | null; // ISO
}

export function computeCustomerStats(orders: OrderForStats[]): CustomerStats {
  let totalSpent = 0;
  let last: number | null = null;
  for (const o of orders) {
    if (o.status !== 'cancelled') totalSpent += o.total;
    const t = new Date(o.createdAt).getTime();
    if (last === null || t > last) last = t;
  }
  return {
    orderCount: orders.length,
    totalSpent,
    lastOrderAt: last === null ? null : new Date(last).toISOString(),
  };
}
