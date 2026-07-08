import { computeOrderPricing, lineTotal } from './pricing';

describe('computeOrderPricing', () => {
  it('รวม subtotal + ค่าส่ง - ส่วนลด', () => {
    const items = [
      { unitPrice: 6000, qty: 2 },
      { unitPrice: 5000, qty: 1 },
    ];
    const p = computeOrderPricing(items, 2000, 1000);
    expect(p.subtotal).toBe(17000);
    expect(p.total).toBe(18000);
  });

  it('total ไม่ต่ำกว่า 0 แม้ส่วนลดเกินยอด', () => {
    const p = computeOrderPricing([{ unitPrice: 5000, qty: 1 }], 0, 9999999);
    expect(p.total).toBe(0);
  });

  it('lineTotal = unitPrice * qty', () => {
    expect(lineTotal({ unitPrice: 6000, qty: 3 })).toBe(18000);
  });
});
