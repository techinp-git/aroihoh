import { withinHours, isAccepting } from './store-hours';

describe('withinHours', () => {
  it('ไม่ตั้งเวลา = เปิดตลอด', () => {
    expect(withinHours(null, null, '03:00')).toBe(true);
  });
  it('ในเวลา 10:00–21:00', () => {
    expect(withinHours('10:00', '21:00', '14:30')).toBe(true);
    expect(withinHours('10:00', '21:00', '09:59')).toBe(false);
    expect(withinHours('10:00', '21:00', '21:30')).toBe(false);
  });
});

describe('isAccepting', () => {
  it('พักรับออเดอร์ (isOpen=false) → ปฏิเสธ', () => {
    const r = isAccepting({ isOpen: false, openTime: '10:00', closeTime: '21:00' }, '12:00');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('พัก');
  });
  it('เปิดอยู่ + ในเวลา → รับได้', () => {
    expect(isAccepting({ isOpen: true, openTime: '10:00', closeTime: '21:00' }, '12:00').ok).toBe(true);
  });
  it('เปิดอยู่ แต่นอกเวลา → ปฏิเสธ', () => {
    const r = isAccepting({ isOpen: true, openTime: '10:00', closeTime: '21:00' }, '22:00');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('นอกเวลา');
  });
});
