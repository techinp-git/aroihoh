import { computeCustomerStats } from './customer-stats';

describe('computeCustomerStats', () => {
  it('นับออเดอร์ทั้งหมด + ยอดเฉพาะที่ไม่ยกเลิก + ล่าสุด', () => {
    const s = computeCustomerStats([
      { status: 'completed', total: 6000, createdAt: '2026-07-01T10:00:00Z' },
      { status: 'cancelled', total: 5000, createdAt: '2026-07-03T10:00:00Z' },
      { status: 'delivering', total: 7000, createdAt: '2026-07-02T10:00:00Z' },
    ]);
    expect(s.orderCount).toBe(3);
    expect(s.totalSpent).toBe(13000); // 6000 + 7000 (ไม่รวม 5000 ยกเลิก)
    expect(s.lastOrderAt).toBe('2026-07-03T10:00:00.000Z'); // ล่าสุดตามเวลา (รวมยกเลิก)
  });

  it('ไม่มีออเดอร์ → 0 / null', () => {
    expect(computeCustomerStats([])).toEqual({ orderCount: 0, totalSpent: 0, lastOrderAt: null });
  });
});
