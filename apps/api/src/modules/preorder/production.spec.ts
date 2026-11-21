import {
  summarizeMenuTotals,
  groupByDropPoint,
  buildProductionSummary,
  boxCount,
  dropKey,
  isProducible,
  type ProdOrder,
  type SlotWindow,
} from './production';

const NOON_START = '2026-11-22T04:00:00.000Z'; // 11:00 ไทย
const NOON_END = '2026-11-22T05:30:00.000Z'; // 12:30 ไทย
const EVE_START = '2026-11-22T10:00:00.000Z'; // 17:00 ไทย
const EVE_END = '2026-11-22T11:30:00.000Z'; // 18:30 ไทย

const windows: SlotWindow[] = [
  { id: 'noon', name: 'รอบเที่ยง', startTime: '11:00', endTime: '12:30', startAt: NOON_START, endAt: NOON_END },
  { id: 'eve', name: 'รอบเย็น', startTime: '17:00', endTime: '18:30', startAt: EVE_START, endAt: EVE_END },
];

function order(p: Partial<ProdOrder> & { id: string }): ProdOrder {
  return {
    status: 'confirmed',
    brandId: 'b1',
    brandName: 'ชิมชีวา',
    customerName: 'ลูกค้า',
    paymentMethod: 'cod',
    total: 6000,
    scheduledAt: new Date(NOON_START),
    address: { detail: 'คอนโด A ห้อง 1', lat: 13.7376, lng: 100.5602 },
    items: [{ menuItemId: 'm1', nameSnapshot: 'ข้าวกะเพรา', qty: 1 }],
    note: null,
    ...p,
  };
}

describe('summarizeMenuTotals', () => {
  it('รวมจำนวนต่อเมนู และเรียงมากไปน้อย', () => {
    const totals = summarizeMenuTotals([
      order({ id: 'o1', items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 2 }] }),
      order({
        id: 'o2',
        items: [
          { menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 3 },
          { menuItemId: 'm2', nameSnapshot: 'ผัดซีอิ๊ว', qty: 1 },
        ],
      }),
    ]);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({ menuItemId: 'm1', qty: 5 });
    expect(totals[1]).toMatchObject({ menuItemId: 'm2', qty: 1 });
  });

  it('ชื่อเมนูเหมือนกันแต่คนละแบรนด์ = แยกกัน (คนละสูตร/คนละแพ็ก)', () => {
    const totals = summarizeMenuTotals([
      order({ id: 'o1', brandId: 'b1', brandName: 'ชิมชีวา', items: [{ menuItemId: 'x1', nameSnapshot: 'กะเพรา', qty: 2 }] }),
      order({ id: 'o2', brandId: 'b2', brandName: 'A La Carte', items: [{ menuItemId: 'x2', nameSnapshot: 'กะเพรา', qty: 4 }] }),
    ]);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({ brandName: 'A La Carte', qty: 4 });
    expect(totals[1]).toMatchObject({ brandName: 'ชิมชีวา', qty: 2 });
  });

  it('ออเดอร์ที่ยกเลิกไม่ถูกนับ — ครัวจะทำอาหารทิ้ง', () => {
    const totals = summarizeMenuTotals([
      order({ id: 'o1', items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 2 }] }),
      order({ id: 'o2', status: 'cancelled', items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 50 }] }),
    ]);
    expect(totals[0].qty).toBe(2);
    expect(isProducible({ status: 'cancelled' })).toBe(false);
    expect(isProducible({ status: 'pending' })).toBe(true);
  });

  it('ไม่มีออเดอร์ = ลิสต์ว่าง ไม่ใช่ error', () => {
    expect(summarizeMenuTotals([])).toEqual([]);
  });
});

describe('boxCount / dropKey', () => {
  it('นับกล่องจากผลรวมจำนวนทุกรายการ', () => {
    expect(boxCount(order({ id: 'o', items: [
      { menuItemId: 'a', nameSnapshot: 'a', qty: 2 },
      { menuItemId: 'b', nameSnapshot: 'b', qty: 3 },
    ] }))).toBe(5);
  });

  it('พิกัดต่างกันในระยะ ~11 เมตร = จุดเดียวกัน', () => {
    const a = order({ id: 'a', address: { detail: 'ตึก A', lat: 13.73761, lng: 100.56021 } });
    const b = order({ id: 'b', address: { detail: 'ตึก A ชั้น 9', lat: 13.73764, lng: 100.56019 } });
    expect(dropKey(a)).toBe(dropKey(b));
  });

  it('พิกัดคนละซอย = คนละจุด', () => {
    const a = order({ id: 'a', address: { detail: 'A', lat: 13.7376, lng: 100.5602 } });
    const b = order({ id: 'b', address: { detail: 'B', lat: 13.7401, lng: 100.5655 } });
    expect(dropKey(a)).not.toBe(dropKey(b));
  });

  it('ไม่มีที่อยู่ก็ยังมีคีย์ (ไม่หายไปจากใบสรุป)', () => {
    expect(dropKey(order({ id: 'a', address: null }))).toBe('no-address');
  });
});

describe('groupByDropPoint — "กี่กล่องต่อจุดส่ง"', () => {
  it('รวมหลายออเดอร์ที่จุดเดียวกัน + รวมยอด COD ของจุดนั้น', () => {
    const drops = groupByDropPoint([
      order({ id: 'o1', total: 6000, address: { detail: 'คอนโด A', lat: 13.7376, lng: 100.5602 },
        items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 2 }] }),
      order({ id: 'o2', total: 9000, address: { detail: 'คอนโด A ล็อบบี้', lat: 13.73762, lng: 100.56022 },
        items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 3 }] }),
      order({ id: 'o3', total: 6000, address: { detail: 'ออฟฟิศ B', lat: 13.7450, lng: 100.5700 },
        items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 1 }] }),
    ]);
    expect(drops).toHaveLength(2);
    // เรียงจุดที่กล่องมากสุดก่อน
    expect(drops[0]).toMatchObject({ boxes: 5, orderCount: 2, codTotal: 15000 });
    expect(drops[1]).toMatchObject({ boxes: 1, orderCount: 1, codTotal: 6000 });
    expect(drops[0].orders.map((o) => o.orderId).sort()).toEqual(['o1', 'o2']);
  });

  it('ออเดอร์ที่จ่ายแล้วไม่เข้ายอดเก็บปลายทาง', () => {
    const drops = groupByDropPoint([
      order({ id: 'o1', paymentMethod: 'promptpay', total: 6000 }),
      order({ id: 'o2', paymentMethod: 'cod', total: 7000 }),
    ]);
    expect(drops[0].codTotal).toBe(7000);
    expect(drops[0].orderCount).toBe(2);
  });

  it('ยกเลิกแล้วไม่นับเป็นจุดส่ง', () => {
    const drops = groupByDropPoint([
      order({ id: 'o1', status: 'cancelled', address: { detail: 'X', lat: 13.9, lng: 100.9 } }),
      order({ id: 'o2' }),
    ]);
    expect(drops).toHaveLength(1);
    expect(drops[0].orders[0].orderId).toBe('o2');
  });
});

describe('buildProductionSummary', () => {
  it('แบ่งออเดอร์เข้ารอบตามช่วงเวลา + สรุปกล่อง/จุด/เมนู', () => {
    const groups = buildProductionSummary(
      [
        order({ id: 'n1', scheduledAt: new Date(NOON_START), items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 2 }] }),
        order({ id: 'n2', scheduledAt: new Date(NOON_START), items: [{ menuItemId: 'm1', nameSnapshot: 'กะเพรา', qty: 1 }],
          address: { detail: 'ตึกอื่น', lat: 13.75, lng: 100.58 } }),
        order({ id: 'e1', scheduledAt: new Date(EVE_START), items: [{ menuItemId: 'm2', nameSnapshot: 'ผัดซีอิ๊ว', qty: 4 }] }),
      ],
      windows,
    );
    expect(groups).toHaveLength(2);
    const noon = groups[0];
    expect(noon).toMatchObject({ slotId: 'noon', orderCount: 2, boxCount: 3, dropCount: 2 });
    expect(noon.menuTotals[0]).toMatchObject({ menuItemId: 'm1', qty: 3 });
    expect(groups[1]).toMatchObject({ slotId: 'eve', orderCount: 1, boxCount: 4, dropCount: 1 });
  });

  it('รอบที่ไม่มีใครสั่งยังโผล่ในใบสรุป (ครัวต้องเห็นว่าศูนย์ ไม่ใช่หาย)', () => {
    const groups = buildProductionSummary([order({ id: 'n1' })], windows);
    expect(groups.map((g) => g.slotId)).toEqual(['noon', 'eve']);
    expect(groups[1]).toMatchObject({ orderCount: 0, boxCount: 0, dropCount: 0 });
    expect(groups[1].menuTotals).toEqual([]);
  });

  it('ออเดอร์ที่หลุดกรอบเวลาของทุกรอบ → bucket "ไม่ตรงรอบ" ไม่หายไปจากตาครัว', () => {
    const groups = buildProductionSummary(
      [
        order({ id: 'n1' }),
        // เจ้าของแก้เวลารอบหลังมีคนจองไว้แล้ว → 09:00 ไทย ไม่ตรงรอบไหน
        order({ id: 'orphan', scheduledAt: new Date('2026-11-22T02:00:00.000Z'), items: [{ menuItemId: 'm9', nameSnapshot: 'ของค้าง', qty: 7 }] }),
      ],
      windows,
    );
    expect(groups).toHaveLength(3);
    const orphan = groups[2];
    expect(orphan.slotId).toBeNull();
    expect(orphan.orderCount).toBe(1);
    expect(orphan.boxCount).toBe(7);
    expect(orphan.name).toContain('ไม่ตรงรอบ');
  });

  it('ออเดอร์ที่ไม่ได้จองรอบ (scheduledAt = null) ไปอยู่ bucket "ไม่ตรงรอบ"', () => {
    const groups = buildProductionSummary([order({ id: 'now', scheduledAt: null })], windows);
    expect(groups[groups.length - 1].slotId).toBeNull();
    expect(groups[groups.length - 1].orderCount).toBe(1);
  });

  it('ขอบรอบนับรวม (เวลาเริ่มและเวลาจบพอดีถือว่าอยู่ในรอบ)', () => {
    const groups = buildProductionSummary(
      [
        order({ id: 'start', scheduledAt: new Date(NOON_START) }),
        order({ id: 'end', scheduledAt: new Date(NOON_END) }),
      ],
      windows,
    );
    expect(groups[0].orderCount).toBe(2);
    expect(groups.some((g) => g.slotId === null)).toBe(false);
  });

  it('ไม่มีรอบเลย แต่มีออเดอร์จองค้าง → ยังเห็นใน bucket ไม่ตรงรอบ', () => {
    const groups = buildProductionSummary([order({ id: 'n1' })], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].slotId).toBeNull();
  });

  it('ไม่มีออเดอร์เลย = รอบทั้งหมดเป็นศูนย์ ไม่มี bucket ไม่ตรงรอบ', () => {
    const groups = buildProductionSummary([], windows);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.orderCount === 0)).toBe(true);
  });
});
