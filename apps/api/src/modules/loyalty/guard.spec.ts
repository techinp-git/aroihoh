import {
  ANOMALY_SCANS,
  DEFAULT_DAILY_EARN_CAP,
  MAX_FAILED_ATTEMPTS,
  bangkokDateKey,
  bangkokDayStart,
  detectAnomalies,
  isThrottled,
  pruneAttempts,
  pointsForOrder,
  resolveDailyCap,
  summarizeDaily,
} from './guard';

describe('resolveDailyCap', () => {
  it('ไม่ตั้งค่า = ใช้ค่าเริ่มต้น', () => {
    expect(resolveDailyCap(null)).toBe(DEFAULT_DAILY_EARN_CAP);
    expect(resolveDailyCap(undefined)).toBe(DEFAULT_DAILY_EARN_CAP);
  });

  it('ตั้งค่าเอง = ใช้ค่านั้น', () => {
    expect(resolveDailyCap(20)).toBe(20);
  });

  it('0 หรือติดลบ (ตั้งค่าพลาด) = ตกกลับค่าเริ่มต้น ไม่ใช่ห้ามสแกนทั้งร้าน', () => {
    expect(resolveDailyCap(0)).toBe(DEFAULT_DAILY_EARN_CAP);
    expect(resolveDailyCap(-3)).toBe(DEFAULT_DAILY_EARN_CAP);
  });
});

describe('รอบวันตามเวลาไทย', () => {
  it('ตี 1 ของไทย ยังเป็นวันเดียวกับสี่ทุ่มของวันเดียวกัน', () => {
    // 2026-09-08 01:00 ไทย = 2026-09-07T18:00Z
    const early = new Date('2026-09-07T18:00:00Z');
    // 2026-09-08 22:00 ไทย = 2026-09-08T15:00Z
    const late = new Date('2026-09-08T15:00:00Z');
    expect(bangkokDayStart(early).toISOString()).toBe(bangkokDayStart(late).toISOString());
    expect(bangkokDateKey(early)).toBe('2026-09-08');
    expect(bangkokDateKey(late)).toBe('2026-09-08');
  });

  it('เที่ยงคืนไทยขึ้นวันใหม่ (ไม่ใช่ตัดรอบตามเวลา UTC)', () => {
    const before = new Date('2026-09-07T16:59:00Z'); // 23:59 ไทย
    const after = new Date('2026-09-07T17:01:00Z'); // 00:01 ไทยของวันถัดไป
    expect(bangkokDateKey(before)).toBe('2026-09-07');
    expect(bangkokDateKey(after)).toBe('2026-09-08');
    expect(bangkokDayStart(before).getTime()).toBeLessThan(bangkokDayStart(after).getTime());
  });

  it('ต้นวันไทยคือ 17:00Z ของวันก่อนหน้า', () => {
    expect(bangkokDayStart(new Date('2026-09-08T03:00:00Z')).toISOString()).toBe(
      '2026-09-07T17:00:00.000Z',
    );
  });
});

describe('จำกัดจำนวนครั้งที่สแกนพลาด', () => {
  const now = 1_000_000_000;

  it('ตัดครั้งที่เก่ากว่ากรอบเวลาออก', () => {
    const attempts = [now - 2 * 60 * 60 * 1000, now - 60 * 1000];
    expect(pruneAttempts(attempts, now)).toHaveLength(1);
  });

  it('ยังไม่ถึงเพดาน = ผ่าน', () => {
    const attempts = Array.from({ length: MAX_FAILED_ATTEMPTS - 1 }, () => now - 1000);
    expect(isThrottled(attempts, now)).toBe(false);
  });

  it('ถึงเพดานในกรอบเวลา = กั้น', () => {
    const attempts = Array.from({ length: MAX_FAILED_ATTEMPTS }, () => now - 1000);
    expect(isThrottled(attempts, now)).toBe(true);
  });

  it('เพดานเดิมแต่ครั้งเก่าหมดอายุแล้ว = ผ่าน (ไม่แบนถาวร)', () => {
    const attempts = Array.from({ length: MAX_FAILED_ATTEMPTS }, () => now - 2 * 60 * 60 * 1000);
    expect(isThrottled(attempts, now)).toBe(false);
  });
});

describe('detectAnomalies', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 8, 8, 10, min));

  it('สแกนรัวเกินเกณฑ์ในกรอบ 10 นาที = ผิดปกติ', () => {
    const scans = [0, 1, 2, 3].map((m) => ({ customerId: 'c1', at: t(m) }));
    const found = detectAnomalies(scans);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ customerId: 'c1', scans: ANOMALY_SCANS });
  });

  it('จำนวนเท่ากันแต่กระจายข้ามชั่วโมง = ปกติ', () => {
    const scans = [0, 30, 60, 90].map((m) => ({ customerId: 'c1', at: t(m) }));
    expect(detectAnomalies(scans)).toHaveLength(0);
  });

  it('นับแยกรายคน ไม่รวมกันข้ามลูกค้า', () => {
    const scans = [
      ...[0, 1].map((m) => ({ customerId: 'c1', at: t(m) })),
      ...[0, 1].map((m) => ({ customerId: 'c2', at: t(m) })),
    ];
    expect(detectAnomalies(scans)).toHaveLength(0);
  });

  it('คืนช่วงที่หนาแน่นที่สุดของแต่ละคน คนละรายการเดียว', () => {
    const scans = [0, 1, 2, 3, 4, 60].map((m) => ({ customerId: 'c1', at: t(m) }));
    const found = detectAnomalies(scans);
    expect(found).toHaveLength(1);
    expect(found[0].scans).toBe(5);
  });

  it('เรียงคนที่ถี่สุดขึ้นก่อน', () => {
    const scans = [
      ...[0, 1, 2, 3].map((m) => ({ customerId: 'c1', at: t(m) })),
      ...[0, 1, 2, 3, 4, 5].map((m) => ({ customerId: 'c2', at: t(m) })),
    ];
    expect(detectAnomalies(scans).map((a) => a.customerId)).toEqual(['c2', 'c1']);
  });
});

describe('summarizeDaily', () => {
  it('แยกแต้มเข้า/ออกตามวันไทย', () => {
    const rows = [
      { type: 'earn' as const, points: 10, createdAt: new Date('2026-09-07T18:00:00Z') }, // 8 ก.ย. ไทย
      { type: 'earn' as const, points: 10, createdAt: new Date('2026-09-08T03:00:00Z') }, // 8 ก.ย. ไทย
      { type: 'redeem' as const, points: -15, createdAt: new Date('2026-09-08T03:30:00Z') },
      { type: 'earn' as const, points: 5, createdAt: new Date('2026-09-06T05:00:00Z') }, // 6 ก.ย.
    ];
    expect(summarizeDaily(rows)).toEqual([
      { date: '2026-09-06', earned: 5, redeemed: 0 },
      { date: '2026-09-08', earned: 20, redeemed: 15 },
    ]);
  });

  it('ไม่มีรายการ = ลิสต์ว่าง', () => {
    expect(summarizeDaily([])).toEqual([]);
  });
});

describe('pointsForOrder (US-56)', () => {
  it('ไม่ตั้งอัตรา = ไม่ให้แต้ม (ต้อง opt-in)', () => {
    expect(pointsForOrder(60000, 0, null)).toBe(0);
    expect(pointsForOrder(60000, 0, undefined)).toBe(0);
    expect(pointsForOrder(60000, 0, 0)).toBe(0);
  });

  it('ทุก 20 บาท ได้ 1 แต้ม · ปัดลง', () => {
    expect(pointsForOrder(6000, 0, 20)).toBe(3); // 60 บาท
    expect(pointsForOrder(5900, 0, 20)).toBe(2); // 59 บาท → 2.95 ปัดลง
  });

  it('หักส่วนลดออกจากฐานคิด (ส่วนลดจากแต้มไม่วนกลับมาเป็นแต้ม)', () => {
    expect(pointsForOrder(12000, 6000, 20)).toBe(3); // จ่ายจริง 60 บาท
  });

  it('ส่วนลดมากกว่าค่าอาหาร (ตั้งค่าเพี้ยน) = 0 ไม่ใช่ติดลบ', () => {
    expect(pointsForOrder(6000, 999999, 20)).toBe(0);
  });

  it('ค่าอาหารน้อยกว่าอัตรา = ยังไม่ได้แต้ม', () => {
    expect(pointsForOrder(1000, 0, 20)).toBe(0); // 10 บาท
  });
});
