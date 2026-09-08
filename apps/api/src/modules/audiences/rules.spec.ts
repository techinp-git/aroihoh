import {
  matchesCriterion,
  matchesAudience,
  resolveAudienceByRules,
  validateRules,
  type AudienceCustomer,
  type AudienceRules,
} from './rules';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // เวลาอ้างอิงคงที่
const daysAgo = (n: number) => new Date(NOW - n * DAY);

const cust = (over: Partial<AudienceCustomer>): AudienceCustomer => ({
  id: 'c',
  createdAt: daysAgo(10),
  tags: [],
  marketingOptedOut: false,
  marketingConsentAt: new Date('2026-01-01'), // PDPA: ยินยอมแล้ว ไม่งั้นถูกตัดออกก่อนเช็คเกณฑ์
  orders: [],
  ...over,
});

describe('matchesAudience — tenure_min_days (สมาชิกเกิน 1 ปี)', () => {
  const rules: AudienceRules = { match: 'all', criteria: [{ type: 'tenure_min_days', days: 365 }] };
  it('สมัครเกิน 1 ปี → เข้า', () => {
    expect(matchesAudience(cust({ createdAt: daysAgo(400) }), rules, NOW)).toBe(true);
  });
  it('สมัครยังไม่ถึงปี → ไม่เข้า', () => {
    expect(matchesAudience(cust({ createdAt: daysAgo(100) }), rules, NOW)).toBe(false);
  });
});

describe('matchesAudience — order_count_in_window (สั่งบ่อยสัปดาห์นี้)', () => {
  const rules: AudienceRules = {
    match: 'all',
    criteria: [{ type: 'order_count_in_window', windowDays: 7, minCount: 6 }],
  };
  it('สั่ง 6 ครั้งใน 7 วัน → เข้า', () => {
    const orders = [1, 2, 3, 4, 5, 6].map((d) => ({ createdAt: daysAgo(d) }));
    expect(matchesAudience(cust({ orders }), rules, NOW)).toBe(true);
  });
  it('สั่ง 5 ครั้ง → ไม่เข้า (บ่อยกว่า 5 = ≥6)', () => {
    const orders = [1, 2, 3, 4, 5].map((d) => ({ createdAt: daysAgo(d) }));
    expect(matchesAudience(cust({ orders }), rules, NOW)).toBe(false);
  });
  it('ออเดอร์เก่ากว่า 7 วันไม่ถูกนับ', () => {
    const orders = [1, 2, 8, 9, 10, 11].map((d) => ({ createdAt: daysAgo(d) }));
    expect(matchesAudience(cust({ orders }), rules, NOW)).toBe(false);
  });
});

describe('matchesAudience — lapsed (หายไปสัปดาห์นี้)', () => {
  const rules: AudienceRules = {
    match: 'all',
    criteria: [{ type: 'lapsed', inactiveDays: 7, lookbackDays: 30 }],
  };
  it('เคยสั่ง 15 วันก่อน แต่เงียบ 7 วันล่าสุด → เข้า (หาย)', () => {
    expect(matchesAudience(cust({ orders: [{ createdAt: daysAgo(15) }] }), rules, NOW)).toBe(true);
  });
  it('ยังสั่งใน 7 วันล่าสุด → ไม่เข้า (ยังอยู่)', () => {
    const orders = [{ createdAt: daysAgo(2) }, { createdAt: daysAgo(15) }];
    expect(matchesAudience(cust({ orders }), rules, NOW)).toBe(false);
  });
  it('ไม่เคยสั่งเลย → ไม่เข้า (ไม่ใช่คนที่หาย)', () => {
    expect(matchesAudience(cust({ orders: [] }), rules, NOW)).toBe(false);
  });
  it('ออเดอร์เก่าเกิน lookback (50 วัน) → ไม่เข้า', () => {
    expect(matchesAudience(cust({ orders: [{ createdAt: daysAgo(50) }] }), rules, NOW)).toBe(false);
  });
});

describe('matchesAudience — combine + PDPA', () => {
  it('match=all → ต้องเข้าทุกเกณฑ์', () => {
    const rules: AudienceRules = {
      match: 'all',
      criteria: [
        { type: 'tenure_min_days', days: 365 },
        { type: 'tags', tags: ['vip'] },
      ],
    };
    expect(matchesAudience(cust({ createdAt: daysAgo(400), tags: ['vip'] }), rules, NOW)).toBe(true);
    expect(matchesAudience(cust({ createdAt: daysAgo(400), tags: [] }), rules, NOW)).toBe(false);
  });
  it('match=any → เข้าเกณฑ์ใดเกณฑ์หนึ่งพอ', () => {
    const rules: AudienceRules = {
      match: 'any',
      criteria: [
        { type: 'tenure_min_days', days: 365 },
        { type: 'tags', tags: ['vip'] },
      ],
    };
    expect(matchesAudience(cust({ createdAt: daysAgo(10), tags: ['vip'] }), rules, NOW)).toBe(true);
  });
  it('opt-out → ตัดทิ้งเสมอแม้ match (PDPA #6)', () => {
    const rules: AudienceRules = { match: 'all', criteria: [] };
    expect(matchesAudience(cust({ marketingOptedOut: true }), rules, NOW)).toBe(false);
  });
  it('criteria ว่าง → ทุกคนที่ไม่ opt-out', () => {
    const rules: AudienceRules = { match: 'all', criteria: [] };
    expect(matchesAudience(cust({}), rules, NOW)).toBe(true);
  });
});

describe('resolveAudienceByRules + validateRules', () => {
  it('กรองรายชื่อได้ถูก', () => {
    const list = [
      cust({ id: 'old', createdAt: daysAgo(400) }),
      cust({ id: 'new', createdAt: daysAgo(5) }),
      cust({ id: 'optout', createdAt: daysAgo(400), marketingOptedOut: true }),
    ];
    const rules: AudienceRules = { match: 'all', criteria: [{ type: 'tenure_min_days', days: 365 }] };
    expect(resolveAudienceByRules(list, rules, NOW).map((c) => c.id)).toEqual(['old']);
  });
  it('validateRules โยน error เมื่อรูปแบบผิด', () => {
    expect(() => validateRules({ match: 'x', criteria: [] })).toThrow();
    expect(() => validateRules({ match: 'all', criteria: [{ type: 'lapsed', inactiveDays: 0, lookbackDays: 5 }] })).toThrow();
    expect(() => validateRules({ match: 'all', criteria: [{ type: 'tenure_min_days', days: 365 }] })).not.toThrow();
  });
});

describe('เกณฑ์ points_min (US-57)', () => {
  const base = {
    id: 'c1',
    createdAt: new Date('2026-01-01'),
    tags: [],
    marketingOptedOut: false,
    marketingConsentAt: new Date('2026-01-01'),
    orders: [],
  };
  const now = new Date('2026-09-08').getTime();

  it('แต้มถึงเกณฑ์ = เข้ากลุ่ม', () => {
    expect(matchesCriterion({ type: 'points_min', points: 100 }, { ...base, pointsBalance: 100 }, now)).toBe(true);
    expect(matchesCriterion({ type: 'points_min', points: 100 }, { ...base, pointsBalance: 250 }, now)).toBe(true);
  });

  it('แต้มไม่ถึง = ไม่เข้ากลุ่ม', () => {
    expect(matchesCriterion({ type: 'points_min', points: 100 }, { ...base, pointsBalance: 99 }, now)).toBe(false);
  });

  it('ลูกค้าที่ไม่มีข้อมูลแต้ม = ถือว่า 0', () => {
    expect(matchesCriterion({ type: 'points_min', points: 1 }, base, now)).toBe(false);
  });

  it('validateRules: points ต้อง ≥ 1', () => {
    expect(() => validateRules({ match: 'all', criteria: [{ type: 'points_min', points: 0 }] })).toThrow();
    expect(() => validateRules({ match: 'all', criteria: [{ type: 'points_min', points: 50 }] })).not.toThrow();
  });
});

describe('matchesAudience — PDPA ม.19 ต้องยินยอมก่อน', () => {
  const base = {
    id: 'c1', createdAt: daysAgo(400), tags: [], marketingOptedOut: false, orders: [],
  };
  const anyone: AudienceRules = { match: 'all', criteria: [] };

  it('ยังไม่เคยยินยอม → ไม่เข้ากลุ่ม แม้เกณฑ์ว่าง (ทุกคน)', () => {
    expect(matchesAudience({ ...base, marketingConsentAt: null }, anyone, NOW)).toBe(false);
  });

  it('ยินยอมแล้ว → เข้ากลุ่มตามปกติ', () => {
    expect(matchesAudience({ ...base, marketingConsentAt: daysAgo(10) }, anyone, NOW)).toBe(true);
  });

  it('ถอนความยินยอมชนะเสมอ แม้เคยยินยอม', () => {
    expect(matchesAudience(
      { ...base, marketingConsentAt: daysAgo(10), marketingOptedOut: true }, anyone, NOW,
    )).toBe(false);
  });
});
