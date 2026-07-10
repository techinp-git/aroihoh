import { summarizeOrders } from './report';

describe('summarizeOrders', () => {
  it('รวมยอดเฉพาะที่ไม่ยกเลิก + นับตามสถานะ', () => {
    const s = summarizeOrders([
      { status: 'completed', total: 6000 },
      { status: 'preparing', total: 12000 },
      { status: 'cancelled', total: 5000 },
    ]);
    expect(s.count).toBe(3);
    expect(s.completed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.revenue).toBe(18000); // 6000 + 12000 (ไม่รวม 5000 ที่ยกเลิก)
    expect(s.avgOrderValue).toBe(9000); // 18000 / 2 (ออเดอร์ที่ไม่ยกเลิก)
    expect(s.byStatus).toEqual({ completed: 1, preparing: 1, cancelled: 1 });
  });

  it('ไม่มีออเดอร์ → 0 ทั้งหมด (ไม่หารด้วยศูนย์)', () => {
    const s = summarizeOrders([]);
    expect(s).toEqual({ count: 0, completed: 0, cancelled: 0, revenue: 0, avgOrderValue: 0, byStatus: {} });
  });

  it('ยกเลิกล้วน → revenue 0, avg 0', () => {
    const s = summarizeOrders([{ status: 'cancelled', total: 9000 }]);
    expect(s.revenue).toBe(0);
    expect(s.avgOrderValue).toBe(0);
  });
});
