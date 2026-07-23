import { summarizeMargin, computeBreakeven, marginByMenu, type MarginOrder } from './margin';

/** ออเดอร์ One Price 60฿: ขาย 60 ต้นทุน 30 ค่าส่ง 20 */
function order(overrides: Partial<MarginOrder> = {}): MarginOrder {
  return {
    status: 'completed',
    subtotal: 6000,
    deliveryFee: 2000,
    discount: 0,
    total: 8000,
    items: [{ qty: 1, unitPrice: 6000, unitCost: 3000, lineTotal: 6000 }],
    ...overrides,
  };
}

describe('summarizeMargin', () => {
  it('คิดมาร์จิ้นจากค่าอาหาร ไม่รวมค่าส่ง', () => {
    const s = summarizeMargin([order()]);
    expect(s.foodRevenue).toBe(6000);
    expect(s.deliveryRevenue).toBe(2000);
    expect(s.foodCost).toBe(3000);
    expect(s.grossProfit).toBe(3000);
    expect(s.marginPct).toBe(50);
  });

  it('ตัดออเดอร์ที่ยกเลิกทิ้ง', () => {
    const s = summarizeMargin([order(), order({ status: 'cancelled' })]);
    expect(s.orders).toBe(1);
    expect(s.revenue).toBe(8000);
  });

  it('หักส่วนลดออกจากรายได้ค่าอาหาร', () => {
    const s = summarizeMargin([order({ discount: 1000, total: 7000 })]);
    expect(s.foodRevenue).toBe(5000);
    expect(s.grossProfit).toBe(2000);
  });

  it('นับกล่องตาม qty ไม่ใช่จำนวนออเดอร์', () => {
    const s = summarizeMargin([
      order({ items: [{ qty: 3, unitPrice: 6000, unitCost: 3000, lineTotal: 18000 }], subtotal: 18000 }),
    ]);
    expect(s.orders).toBe(1);
    expect(s.boxes).toBe(3);
  });

  it('contribution ต่อกล่อง = ราคาขายเฉลี่ย − ต้นทุนเฉลี่ย', () => {
    const s = summarizeMargin([order()]);
    expect(s.avgPricePerBox).toBe(6000);
    expect(s.avgCostPerBox).toBe(3000);
    expect(s.contributionPerBox).toBe(3000);
  });

  // ── จุดที่ทำให้ตัวเลข "โกหก" ถ้าไม่ระวัง ──
  it('เมนูที่ไม่มีต้นทุน → costCoverage บอกว่าข้อมูลไม่ครบ', () => {
    const s = summarizeMargin([
      order(),
      order({ items: [{ qty: 1, unitPrice: 6000, unitCost: null, lineTotal: 6000 }] }),
    ]);
    expect(s.costCoverage).toBe(50);
    expect(s.boxesMissingCost).toBe(1);
  });

  it('ไม่มีต้นทุนเลย → coverage 0 และไม่แกล้งทำเป็นกำไร 100%', () => {
    const s = summarizeMargin([order({ items: [{ qty: 1, unitPrice: 6000, unitCost: null, lineTotal: 6000 }] })]);
    expect(s.costCoverage).toBe(0);
    expect(s.avgCostPerBox).toBe(0);
    expect(s.contributionPerBox).toBe(0); // ไม่ใช่ 6000 — กันเอาไปตัดสินใจผิด
  });

  it('เฉลี่ยต้นทุนจากเฉพาะกล่องที่มีข้อมูล (ไม่ถูกกล่องว่างดึงลง)', () => {
    const s = summarizeMargin([
      order({
        items: [
          { qty: 1, unitPrice: 6000, unitCost: 3000, lineTotal: 6000 },
          { qty: 1, unitPrice: 6000, unitCost: null, lineTotal: 6000 },
        ],
        subtotal: 12000,
      }),
    ]);
    expect(s.avgCostPerBox).toBe(3000); // ไม่ใช่ 1500
  });

  it('ไม่มีออเดอร์ → ทุกค่าเป็น 0 ไม่ NaN', () => {
    const s = summarizeMargin([]);
    expect(s.orders).toBe(0);
    expect(s.marginPct).toBe(0);
    expect(s.avgPricePerBox).toBe(0);
    expect(Number.isNaN(s.contributionPerBox)).toBe(false);
  });
});

describe('computeBreakeven', () => {
  // ค่าคงที่ 3,900 บาท/วัน · contribution 30 บาท/กล่อง → 130 กล่อง/วัน (ตรงกับแผนธุรกิจ)
  const FIXED = 390000;

  it('คำนวณจุดคุ้มทุนตามแผน One Price (130 กล่อง/วัน)', () => {
    const s = summarizeMargin([order()]);
    const b = computeBreakeven(s, FIXED);
    expect(b.boxesPerDay).toBe(130);
  });

  it('ปัดขึ้นเสมอ — ขายเศษกล่องไม่ได้', () => {
    const s = summarizeMargin([order()]);
    const b = computeBreakeven(s, 390100); // เกินมานิดเดียว
    expect(b.boxesPerDay).toBe(131);
  });

  it('ขายถึงเป้า → reached + gap เป็นบวก', () => {
    const s = summarizeMargin(
      Array.from({ length: 150 }, () => order()),
    );
    const b = computeBreakeven(s, FIXED);
    expect(b.reached).toBe(true);
    expect(b.gap).toBe(20);
    expect(b.netProfit).toBe(3000 * 150 - FIXED); // 60,000 สตางค์ = 600 บาท
  });

  it('ขายไม่ถึง → ยังไม่ reached และ gap ติดลบ', () => {
    const s = summarizeMargin(Array.from({ length: 100 }, () => order()));
    const b = computeBreakeven(s, FIXED);
    expect(b.reached).toBe(false);
    expect(b.gap).toBe(-30);
    expect(b.netProfit).toBeLessThan(0);
  });

  it('ยังไม่ตั้งค่าใช้จ่ายคงที่ → คืน null พร้อมเหตุผล ไม่เดา', () => {
    const b = computeBreakeven(summarizeMargin([order()]), null);
    expect(b.boxesPerDay).toBeNull();
    expect(b.reason).toContain('ค่าใช้จ่ายคงที่');
  });

  it('ยังไม่กรอกต้นทุนเมนู → บอกให้ไปกรอก ไม่คืนตัวเลขมั่ว', () => {
    const s = summarizeMargin([order({ items: [{ qty: 1, unitPrice: 6000, unitCost: null, lineTotal: 6000 }] })]);
    const b = computeBreakeven(s, FIXED);
    expect(b.boxesPerDay).toBeNull();
    expect(b.reason).toContain('ต้นทุน');
  });

  it('ต้นทุนสูงกว่าราคาขาย → เตือนว่าขายยิ่งขายยิ่งขาดทุน', () => {
    const s = summarizeMargin([order({ items: [{ qty: 1, unitPrice: 6000, unitCost: 7000, lineTotal: 6000 }] })]);
    const b = computeBreakeven(s, FIXED);
    expect(b.boxesPerDay).toBeNull();
    expect(b.reason).toContain('≤ 0');
  });
});

describe('marginByMenu', () => {
  const items = [
    { nameSnapshot: 'แกงเขียวหวาน', qty: 3, unitPrice: 6000, unitCost: 3000, lineTotal: 18000 },
    { nameSnapshot: 'ผัดซีอิ๊ว', qty: 1, unitPrice: 6000, unitCost: 4000, lineTotal: 6000 },
    { nameSnapshot: 'แกงเขียวหวาน', qty: 2, unitPrice: 6000, unitCost: 3000, lineTotal: 12000 },
  ];

  it('รวมยอดต่อเมนูและเรียงตามจำนวนขาย', () => {
    const rows = marginByMenu(items);
    expect(rows[0].name).toBe('แกงเขียวหวาน');
    expect(rows[0].qty).toBe(5);
    expect(rows[0].revenue).toBe(30000);
  });

  it('คิด % มาร์จิ้นต่อเมนู — เห็นตัวที่ขายดีแต่กำไรบาง', () => {
    const rows = marginByMenu(items);
    const green = rows.find((r) => r.name === 'แกงเขียวหวาน')!;
    const pad = rows.find((r) => r.name === 'ผัดซีอิ๊ว')!;
    expect(green.marginPct).toBe(50);
    expect(pad.marginPct).toBe(33.3); // ขายเท่ากันแต่ต้นทุนสูงกว่า
  });

  it('เมนูที่ไม่มีต้นทุน → hasCost=false ไม่นับเป็นกำไรเต็ม', () => {
    const rows = marginByMenu([{ nameSnapshot: 'ใหม่', qty: 1, unitPrice: 6000, unitCost: null, lineTotal: 6000 }]);
    expect(rows[0].hasCost).toBe(false);
    expect(rows[0].profit).toBe(0);
    expect(rows[0].marginPct).toBe(0);
  });
});
