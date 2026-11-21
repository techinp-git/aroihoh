import {
  parseHHMM,
  isValidHHMM,
  isValidDateKey,
  bangkokDateKey,
  bangkokInstant,
  nextBangkokDateKey,
  addDaysToDateKey,
  cutoffInstantFor,
  buildSlotAvailability,
  resolvePreorder,
  validateSlotTimes,
  DEFAULT_PREORDER_CUTOFF,
  DEFAULT_SLOTS,
  type SlotRow,
} from './preorder';

const slots: SlotRow[] = [
  { id: 'noon', name: 'รอบเที่ยง', startTime: '11:00', endTime: '12:30', sortOrder: 1, isActive: true },
  { id: 'eve', name: 'รอบเย็น', startTime: '17:00', endTime: '18:30', sortOrder: 2, isActive: true },
];

describe('parseHHMM / isValidHHMM', () => {
  it('รับเฉพาะ HH:MM ที่มีจริง', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('20:00')).toBe(1200);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('11:60')).toBeNull();
    expect(parseHHMM('9:00')).toBeNull();
    expect(isValidHHMM('17:30')).toBe(true);
    expect(isValidHHMM('')).toBe(false);
  });
});

describe('เขตเวลาไทย (UTC+7) — ไม่ใช่ UTC', () => {
  it('ดึก ๆ ของไทยยังเป็นวันไทย ทั้งที่ UTC เป็นวันก่อนหน้า', () => {
    // 2026-11-22 00:30 เวลาไทย = 2026-11-21 17:30 UTC
    const at = new Date('2026-11-21T17:30:00Z');
    expect(at.toISOString().slice(0, 10)).toBe('2026-11-21'); // วัน UTC
    expect(bangkokDateKey(at)).toBe('2026-11-22'); // วันไทย
  });

  it('เย็นไทยยังเป็นวันเดียวกับ UTC', () => {
    expect(bangkokDateKey(new Date('2026-11-21T12:00:00Z'))).toBe('2026-11-21');
  });

  it('bangkokInstant แปลง "วันไทย + เวลาไทย" เป็น instant จริง', () => {
    expect(bangkokInstant('2026-11-22', '11:00').toISOString()).toBe('2026-11-22T04:00:00.000Z');
    expect(bangkokInstant('2026-11-22', '00:00').toISOString()).toBe('2026-11-21T17:00:00.000Z');
  });

  it('พรุ่งนี้ตามเวลาไทย — ตอน 23:00 ไทย พรุ่งนี้ต้องเป็นวันถัดไปของไทย', () => {
    // 2026-11-21 23:00 ไทย = 16:00 UTC → พรุ่งนี้ = 22 (ถ้าใช้ UTC จะได้ 22 เหมือนกัน)
    expect(nextBangkokDateKey(new Date('2026-11-21T16:00:00Z'))).toBe('2026-11-22');
    // 2026-11-22 01:00 ไทย = 2026-11-21 18:00 UTC → พรุ่งนี้ต้องเป็น 23 ไม่ใช่ 22
    expect(nextBangkokDateKey(new Date('2026-11-21T18:00:00Z'))).toBe('2026-11-23');
  });

  it('addDaysToDateKey ข้ามเดือน/ข้ามปีได้', () => {
    expect(addDaysToDateKey('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysToDateKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDaysToDateKey('2028-02-28', 1)).toBe('2028-02-29'); // ปีอธิกสุรทิน
  });

  it('isValidDateKey ปฏิเสธวันที่ที่ไม่มีจริง', () => {
    expect(isValidDateKey('2026-11-22')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('22/11/2026')).toBe(false);
  });
});

describe('cutoffInstantFor', () => {
  it('ปิดรับคือเวลา cutoff ของวันก่อนวันส่ง (D-1)', () => {
    // ส่งวันที่ 22 ปิดรับ 21 เวลา 20:00 ไทย = 13:00 UTC
    expect(cutoffInstantFor('2026-11-22', '20:00').toISOString()).toBe('2026-11-21T13:00:00.000Z');
  });
  it('ข้ามเดือนได้', () => {
    expect(cutoffInstantFor('2026-12-01', '20:00').toISOString()).toBe('2026-11-30T13:00:00.000Z');
  });
});

describe('buildSlotAvailability', () => {
  // 2026-11-21 19:00 ไทย = 12:00 UTC (ก่อน cutoff 20:00)
  const before = new Date('2026-11-21T12:00:00Z');
  // 2026-11-21 20:30 ไทย = 13:30 UTC (เลย cutoff แล้ว)
  const after = new Date('2026-11-21T13:30:00Z');

  it('ก่อน cutoff → ทุกรอบของพรุ่งนี้เลือกได้', () => {
    const av = buildSlotAvailability(slots, '20:00', before);
    expect(av).toHaveLength(2);
    expect(av.every((s) => s.closed === false)).toBe(true);
    expect(av[0].serviceDate).toBe('2026-11-22');
    expect(av[0].startAt).toBe('2026-11-22T04:00:00.000Z'); // 11:00 ไทย
    expect(av[0].cutoffAt).toBe('2026-11-21T13:00:00.000Z');
    expect(av[0].msLeft).toBe(60 * 60 * 1000); // เหลือ 1 ชม.
  });

  it('เลย cutoff → ปิดทุกรอบ + msLeft = 0', () => {
    const av = buildSlotAvailability(slots, '20:00', after);
    expect(av.every((s) => s.closed === true)).toBe(true);
    expect(av.every((s) => s.msLeft === 0)).toBe(true);
  });

  it('ถึง cutoff ตรงเวลาพอดี = ปิดแล้ว (ไม่ใช่ยังเปิด)', () => {
    const at = new Date('2026-11-21T13:00:00Z'); // 20:00:00 ไทย
    expect(buildSlotAvailability(slots, '20:00', at)[0].closed).toBe(true);
  });

  it('รอบที่ปิดใช้งานไม่โผล่ให้ลูกค้าเห็น', () => {
    const av = buildSlotAvailability(
      [...slots, { id: 'off', name: 'รอบดึก', startTime: '21:00', endTime: '22:00', sortOrder: 3, isActive: false }],
      '20:00',
      before,
    );
    expect(av.map((s) => s.id)).toEqual(['noon', 'eve']);
  });

  it('เรียงตาม sortOrder แล้วตามเวลาเริ่ม', () => {
    const shuffled: SlotRow[] = [
      { id: 'c', name: 'c', startTime: '19:00', endTime: '20:00', sortOrder: 5, isActive: true },
      { id: 'a', name: 'a', startTime: '08:00', endTime: '09:00', sortOrder: 1, isActive: true },
      { id: 'b', name: 'b', startTime: '07:00', endTime: '07:30', sortOrder: 1, isActive: true },
    ];
    expect(buildSlotAvailability(shuffled, '20:00', before).map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('ขอรอบของวันอื่นได้ (ใบสรุปยอดผลิตย้อน/ล่วงหน้า)', () => {
    const av = buildSlotAvailability(slots, '20:00', before, '2026-11-25');
    expect(av[0].serviceDate).toBe('2026-11-25');
    expect(av[0].cutoffAt).toBe('2026-11-24T13:00:00.000Z');
    expect(av[0].closed).toBe(false);
  });
});

describe('resolvePreorder — ตัวตัดสินฝั่ง server', () => {
  const before = new Date('2026-11-21T12:00:00Z'); // 19:00 ไทย
  const after = new Date('2026-11-21T13:30:00Z'); // 20:30 ไทย

  it('ก่อน cutoff → ผ่าน และ scheduledAt = เวลาเริ่มรอบของพรุ่งนี้', () => {
    const r = resolvePreorder(slots, '20:00', 'eve', before);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('ควรผ่าน');
    expect(r.scheduledAt.toISOString()).toBe('2026-11-22T10:00:00.000Z'); // 17:00 ไทย
    expect(r.slot.name).toBe('รอบเย็น');
  });

  it('หลัง cutoff → PREORDER_CUTOFF_PASSED พร้อมบอกเวลาปิดรับ', () => {
    const r = resolvePreorder(slots, '20:00', 'eve', after);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.code).toBe('PREORDER_CUTOFF_PASSED');
    expect(r.reason).toContain('20:00');
    expect(r.cutoffAt).toBe('2026-11-21T13:00:00.000Z');
  });

  it('รอบที่ไม่มี / ปิดใช้งาน / ของครัวอื่น → SLOT_NOT_FOUND (ไม่บอกว่ามีอยู่จริง)', () => {
    const r = resolvePreorder(slots, '20:00', 'ไม่มีรอบนี้', before);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.code).toBe('SLOT_NOT_FOUND');

    const off: SlotRow[] = [{ ...slots[0], isActive: false }];
    const r2 = resolvePreorder(off, '20:00', 'noon', before);
    expect(r2.ok).toBe(false);
    if (r2.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r2.code).toBe('SLOT_NOT_FOUND');
  });

  it('ไม่มีรอบเลย (ครัวยังไม่ตั้งค่า) → SLOT_NOT_FOUND ไม่ใช่ crash', () => {
    const r = resolvePreorder([], '20:00', 'noon', before);
    expect(r.ok).toBe(false);
  });

  it('cutoff ที่ตั้งเองได้ผล — ปิดรับ 14:00 แล้วสั่งตอน 19:00 ไม่ได้', () => {
    const r = resolvePreorder(slots, '14:00', 'noon', before);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.code).toBe('PREORDER_CUTOFF_PASSED');
  });

  it('สั่งตอนเช้าตรู่ของวันไทย ยังทันรอบพรุ่งนี้', () => {
    // 2026-11-22 02:00 ไทย = 2026-11-21 19:00 UTC → พรุ่งนี้ = 23, cutoff = 22 เวลา 20:00
    const r = resolvePreorder(slots, '20:00', 'noon', new Date('2026-11-21T19:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('ควรผ่าน');
    expect(r.slot.serviceDate).toBe('2026-11-23');
  });
});

describe('validateSlotTimes', () => {
  it('ผ่านเมื่อเริ่มก่อนจบ', () => {
    expect(validateSlotTimes('11:00', '12:30')).toBeNull();
  });
  it('ปฏิเสธรูปแบบผิด / เริ่มหลังจบ / เท่ากัน (ไม่รองรับข้ามเที่ยงคืน)', () => {
    expect(validateSlotTimes('25:00', '12:30')).toContain('เวลาเริ่ม');
    expect(validateSlotTimes('11:00', '99:99')).toContain('สิ้นสุด');
    expect(validateSlotTimes('18:00', '11:00')).toContain('ต้องก่อน');
    expect(validateSlotTimes('11:00', '11:00')).toContain('ต้องก่อน');
  });
});

describe('ค่าเริ่มต้นตรงกับที่ตกลงไว้', () => {
  it('ปิดรับ 20:00 + 2 รอบ เที่ยง/เย็น', () => {
    expect(DEFAULT_PREORDER_CUTOFF).toBe('20:00');
    expect(DEFAULT_SLOTS.map((s) => [s.startTime, s.endTime])).toEqual([
      ['11:00', '12:30'],
      ['17:00', '18:30'],
    ]);
    for (const s of DEFAULT_SLOTS) expect(validateSlotTimes(s.startTime, s.endTime)).toBeNull();
  });
});
