import {
  CODE_ALPHABET,
  CODE_LENGTH,
  REDEMPTION_TTL_MS,
  TOKEN_LENGTH,
  balanceFromLedger,
  canRedeem,
  formatCodeForHuman,
  generateCode,
  generateToken,
  isExpired,
  isValidCodeFormat,
  nextReward,
  normalizeCode,
  redemptionExpiry,
} from './ledger';

const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i * 7 + 3));

describe('generateCode / generateToken', () => {
  it('ยาวตามที่กำหนดและใช้เฉพาะตัวอักษรในชุด', () => {
    const code = generateCode(bytes(32));
    expect(code).toHaveLength(CODE_LENGTH);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);

    const token = generateToken(bytes(32));
    expect(token).toHaveLength(TOKEN_LENGTH);
    // สั้นพอให้คนขายพิมพ์เองได้ (3 กลุ่มละ 4)
    expect(formatCodeForHuman(token)).toHaveLength(TOKEN_LENGTH + 2);
  });

  it('ไม่มีตัวที่คนอ่านสับสน (0 O 1 I L)', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('bytes ไม่พอ → โยน error แทนที่จะออกโค้ดสั้นกว่าที่ควร', () => {
    expect(() => generateCode(bytes(4))).toThrow();
    expect(() => generateToken(bytes(6))).toThrow();
  });

  it('bytes ต่างกัน → โค้ดต่างกัน', () => {
    const a = generateCode(new Uint8Array(16).fill(1));
    const b = generateCode(new Uint8Array(16).fill(2));
    expect(a).not.toBe(b);
  });
});

describe('normalizeCode', () => {
  it('ตัดขีด/ช่องว่าง และเป็นตัวใหญ่', () => {
    expect(normalizeCode('a2c4-e6g8 j2m4-p6r8')).toBe('A2C4E6G8J2M4P6R8');
  });

  it('แก้ตัวที่คนพิมพ์สลับให้กลับมาอยู่ในชุดตัวอักษร', () => {
    // O/0 ไม่อยู่ในชุด → ต้องกลายเป็นตัวที่อยู่ในชุด ไม่ใช่ค้างเป็น 0
    const out = normalizeCode('OOOO1111IIIILLLL');
    expect([...out].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });
});

describe('isValidCodeFormat', () => {
  it('ผ่านเฉพาะความยาวถูกและตัวอักษรอยู่ในชุด', () => {
    expect(isValidCodeFormat(generateCode(bytes(32)))).toBe(true);
    expect(isValidCodeFormat('SHORT')).toBe(false);
    expect(isValidCodeFormat('0'.repeat(CODE_LENGTH))).toBe(false); // 0 ไม่อยู่ในชุด
  });
});

describe('formatCodeForHuman', () => {
  it('แบ่งกลุ่มละ 4 ด้วยขีด', () => {
    expect(formatCodeForHuman('A2C4E6G8J2M4P6R8')).toBe('A2C4-E6G8-J2M4-P6R8');
  });

  it('อ่านกลับด้วย normalizeCode ได้ค่าเดิม', () => {
    const code = generateCode(bytes(32));
    expect(normalizeCode(formatCodeForHuman(code))).toBe(code);
  });
});

describe('อายุคูปอง', () => {
  const now = new Date('2026-09-08T10:00:00Z');

  it('หมดอายุ 10 นาทีหลังออกคูปอง', () => {
    expect(redemptionExpiry(now).getTime() - now.getTime()).toBe(REDEMPTION_TTL_MS);
  });

  it('ยังไม่ถึงเวลา = ยังไม่หมดอายุ', () => {
    expect(isExpired(redemptionExpiry(now), now)).toBe(false);
  });

  it('ถึงเวลาพอดี = หมดอายุแล้ว (ไม่ปล่อยผ่านเส้นตาย)', () => {
    expect(isExpired(now, now)).toBe(true);
  });
});

describe('canRedeem', () => {
  it('แต้มพอ = แลกได้', () => {
    expect(canRedeem(100, 100)).toBe(true);
    expect(canRedeem(101, 100)).toBe(true);
  });

  it('แต้มไม่พอ = แลกไม่ได้', () => {
    expect(canRedeem(99, 100)).toBe(false);
    expect(canRedeem(0, 1)).toBe(false);
  });

  it('รางวัลราคา 0 หรือติดลบ = ไม่ให้แลก (ตั้งค่าผิด)', () => {
    expect(canRedeem(100, 0)).toBe(false);
    expect(canRedeem(100, -50)).toBe(false);
  });
});

describe('balanceFromLedger', () => {
  it('รวมทั้ง earn และ redeem ตามเครื่องหมาย', () => {
    expect(balanceFromLedger([{ points: 10 }, { points: 10 }, { points: -15 }])).toBe(5);
  });

  it('ไม่มีรายการ = 0', () => {
    expect(balanceFromLedger([])).toBe(0);
  });
});

describe('nextReward', () => {
  const rewards = [
    { id: 'a', name: 'น้ำอัดลม', pointsCost: 40 },
    { id: 'b', name: 'ข้าวมันไก่', pointsCost: 100 },
    { id: 'c', name: 'ส่วนลด 60', pointsCost: 150 },
  ];

  it('เลือกรางวัลถูกสุดที่ยังแลกไม่ได้ (ให้มีเป้าเดินต่อ)', () => {
    expect(nextReward(0, rewards)?.id).toBe('a');
    expect(nextReward(50, rewards)?.id).toBe('b');
    expect(nextReward(100, rewards)?.id).toBe('c');
  });

  it('แลกได้หมดแล้ว → คืนรางวัลถูกสุด (แลกได้เลย)', () => {
    expect(nextReward(999, rewards)?.id).toBe('a');
  });

  it('ยังไม่มีรางวัลในระบบ → null', () => {
    expect(nextReward(100, [])).toBeNull();
  });
});
