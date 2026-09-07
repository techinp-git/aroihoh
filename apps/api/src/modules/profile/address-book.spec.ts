import {
  MAX_SAVED_ADDRESSES,
  canAddSavedAddress,
  normalizeLabel,
  sortAddressBook,
  nextDefaultAfterRemoval,
  normalizeThaiPhone,
  phoneLast4,
} from './address-book';

const at = (iso: string) => new Date(iso);

describe('canAddSavedAddress', () => {
  it('ยังว่างอยู่ = เพิ่มได้', () => {
    expect(canAddSavedAddress(0)).toBe(true);
    expect(canAddSavedAddress(MAX_SAVED_ADDRESSES - 1)).toBe(true);
  });

  it('ครบเพดาน 5 = เพิ่มไม่ได้', () => {
    expect(canAddSavedAddress(MAX_SAVED_ADDRESSES)).toBe(false);
    expect(canAddSavedAddress(MAX_SAVED_ADDRESSES + 1)).toBe(false);
  });
});

describe('normalizeLabel', () => {
  it('ตัดช่องว่างหัวท้าย + ยุบช่องว่างซ้ำ', () => {
    expect(normalizeLabel('  ที่   ทำงาน  ')).toBe('ที่ ทำงาน');
  });

  it('ว่าง/ช่องว่างล้วน/undefined → null', () => {
    expect(normalizeLabel('')).toBeNull();
    expect(normalizeLabel('   ')).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
  });

  it('ยาวเกิน 30 ตัวถูกตัด', () => {
    expect(normalizeLabel('ก'.repeat(50))).toHaveLength(30);
  });
});

describe('sortAddressBook', () => {
  const home = { id: 'home', isDefault: true, updatedAt: at('2026-01-01') };
  const work = { id: 'work', isDefault: false, updatedAt: at('2026-03-01') };
  const gym = { id: 'gym', isDefault: false, updatedAt: at('2026-02-01') };

  it('หมุดหลักมาก่อนเสมอแม้แก้ไขนานแล้ว', () => {
    expect(sortAddressBook([work, gym, home]).map((a) => a.id)).toEqual([
      'home',
      'work',
      'gym',
    ]);
  });

  it('ที่เหลือเรียงแก้ล่าสุดก่อน', () => {
    expect(sortAddressBook([gym, work]).map((a) => a.id)).toEqual(['work', 'gym']);
  });

  it('ไม่แก้ array เดิม', () => {
    const input = [gym, work];
    sortAddressBook(input);
    expect(input.map((a) => a.id)).toEqual(['gym', 'work']);
  });
});

describe('nextDefaultAfterRemoval', () => {
  const work = { id: 'work', isDefault: false, updatedAt: at('2026-03-01') };
  const gym = { id: 'gym', isDefault: false, updatedAt: at('2026-02-01') };

  it('ลบหมุดหลัก → เลื่อนหมุดที่แก้ล่าสุดขึ้นแทน', () => {
    expect(nextDefaultAfterRemoval([gym, work], true)).toBe('work');
  });

  it('ลบหมุดธรรมดา → ไม่ต้องเปลี่ยนหมุดหลัก', () => {
    expect(nextDefaultAfterRemoval([gym, work], false)).toBeNull();
  });

  it('ลบหมุดสุดท้าย → ไม่มีหมุดหลัก', () => {
    expect(nextDefaultAfterRemoval([], true)).toBeNull();
  });
});

describe('normalizeThaiPhone', () => {
  it('รับมือถือหลายรูปแบบ → 0XXXXXXXXX', () => {
    expect(normalizeThaiPhone('0812345678')).toBe('0812345678');
    expect(normalizeThaiPhone('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhone('0612345678')).toBe('0612345678');
    expect(normalizeThaiPhone('0912345678')).toBe('0912345678');
  });

  it('รับเบอร์บ้าน 9 หลัก', () => {
    expect(normalizeThaiPhone('02-123-4567')).toBe('021234567');
  });

  it('เบอร์ผิดรูปแบบ → null', () => {
    expect(normalizeThaiPhone('123')).toBeNull();
    expect(normalizeThaiPhone('08123456789')).toBeNull(); // ยาวเกิน
    expect(normalizeThaiPhone('1812345678')).toBeNull(); // ไม่ขึ้นต้น 0
    expect(normalizeThaiPhone('')).toBeNull();
    expect(normalizeThaiPhone('ไม่ใช่เบอร์')).toBeNull();
  });
});

describe('phoneLast4', () => {
  it('คืน 4 ตัวท้าย', () => {
    expect(phoneLast4('0812345678')).toBe('5678');
  });

  it('ไม่มีเบอร์/สั้นเกิน → null', () => {
    expect(phoneLast4(null)).toBeNull();
    expect(phoneLast4('12')).toBeNull();
  });
});
