/** US-13: สรุปยอด — pure, unit-testable (ใช้ซ้ำได้ทั้ง admin dashboard + Telegram EOD) */

export interface OrderLite {
  status: string;
  total: number; // สตางค์
}

export interface DailySummary {
  count: number;
  completed: number;
  cancelled: number;
  revenue: number; // รวมยอดที่ไม่ยกเลิก (สตางค์)
  avgOrderValue: number; // เฉลี่ยต่อออเดอร์ที่ไม่ยกเลิก
  byStatus: Record<string, number>;
}

export function summarizeOrders(orders: OrderLite[]): DailySummary {
  const byStatus: Record<string, number> = {};
  let revenue = 0;
  let completed = 0;
  let cancelled = 0;

  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.status === 'cancelled') {
      cancelled += 1;
    } else {
      revenue += o.total;
    }
    if (o.status === 'completed') completed += 1;
  }

  const paying = orders.length - cancelled;
  const avgOrderValue = paying > 0 ? Math.round(revenue / paying) : 0;

  return { count: orders.length, completed, cancelled, revenue, avgOrderValue, byStatus };
}
