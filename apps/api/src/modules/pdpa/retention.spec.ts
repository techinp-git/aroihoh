import {
  ANONYMIZED_NAME,
  RETENTION,
  cutoffs,
  describePlan,
  detachedLineUserId,
  isInactive,
  lastActivityAt,
} from './retention';

const NOW = new Date('2026-09-09T00:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MONTH = 30 * 24 * 60 * 60 * 1000;

const base = {
  id: 'c1',
  createdAt: ago(24 * MONTH),
  updatedAt: ago(24 * MONTH),
  anonymized: false,
};

describe('cutoffs', () => {
  it('บัญชีและแชต 12 เดือน · ออเดอร์ 5 ปี', () => {
    expect(RETENTION.inactiveCustomerMs).toBe(12 * MONTH);
    expect(RETENTION.chatMs).toBe(12 * MONTH);
    expect(RETENTION.orderMs).toBe(5 * 365 * 24 * 60 * 60 * 1000);
    const c = cutoffs(NOW);
    expect(c.order.getTime()).toBeLessThan(c.inactiveCustomer.getTime());
  });
});

describe('lastActivityAt', () => {
  it('ใช้ค่ามากที่สุดของทุกช่องทาง', () => {
    const at = lastActivityAt({ ...base, lastOrderAt: ago(3 * MONTH), lastChatAt: ago(20 * MONTH) });
    expect(at.getTime()).toBe(ago(3 * MONTH).getTime());
  });

  it('ไม่มีออเดอร์/แชตเลย = ใช้วันสมัครหรือวันแก้ล่าสุด', () => {
    const at = lastActivityAt({ ...base, updatedAt: ago(2 * MONTH), lastOrderAt: null, lastChatAt: null });
    expect(at.getTime()).toBe(ago(2 * MONTH).getTime());
  });
});

describe('isInactive', () => {
  it('เงียบเกิน 12 เดือน = หมดอายุ', () => {
    expect(isInactive({ ...base, lastOrderAt: ago(13 * MONTH) }, NOW)).toBe(true);
  });

  it('เพิ่งสั่งภายใน 12 เดือน = ยังไม่หมดอายุ', () => {
    expect(isInactive({ ...base, lastOrderAt: ago(11 * MONTH) }, NOW)).toBe(false);
  });

  it('ไม่เคยสั่งแต่เพิ่งแก้ที่อยู่ = ยังไม่หมดอายุ (กำลังจะสั่ง อย่าเพิ่งลบ)', () => {
    expect(isInactive({ ...base, updatedAt: ago(1 * MONTH), lastOrderAt: null }, NOW)).toBe(false);
  });

  it('ทักแชตล่าสุดก็นับเป็นกิจกรรม', () => {
    expect(isInactive({ ...base, lastOrderAt: ago(20 * MONTH), lastChatAt: ago(2 * MONTH) }, NOW)).toBe(false);
  });

  it('ทำให้ไม่ระบุตัวตนไปแล้ว = ข้าม ไม่ทำซ้ำ', () => {
    expect(isInactive({ ...base, lastOrderAt: ago(30 * MONTH), anonymized: true }, NOW)).toBe(false);
  });
});

describe('detachedLineUserId', () => {
  it('ผูกกับ id จึงไม่ชนกันเองแม้ทำหลายคนพร้อมกัน', () => {
    expect(detachedLineUserId('a')).not.toBe(detachedLineUserId('b'));
    expect(detachedLineUserId('a')).toContain('a');
  });
});

describe('describePlan', () => {
  it('บอกจำนวนครบทุกอย่างที่จะแตะ (ต้องอ่านออกใน log)', () => {
    const t = describePlan({ customers: 2, chats: 10, chatImages: 3, orders: 0, pointsVoided: 50 });
    expect(t).toContain('ลูกค้าที่จะทำให้ไม่ระบุตัวตน: 2');
    expect(t).toContain('ข้อความแชตที่จะลบ: 10');
    expect(t).toContain('แต้มที่จะถูกตัดเป็นหมดอายุ: 50');
  });
});

describe('ANONYMIZED_NAME', () => {
  it('ต่างจากข้อความตอนลบตามคำขอ จะได้แยกออกว่าลบเพราะอะไร', () => {
    expect(ANONYMIZED_NAME).not.toBe('ลบตามคำขอ');
  });
});
