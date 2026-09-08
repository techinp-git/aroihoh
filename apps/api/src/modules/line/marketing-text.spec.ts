import {
  UNSUBSCRIBE_HINT,
  isUnsubscribeRequest,
  withUnsubscribeHint,
} from './marketing-text';

describe('isUnsubscribeRequest', () => {
  it('จับคำขอออกจากรายชื่อภาษาไทยหลายแบบ', () => {
    expect(isUnsubscribeRequest('หยุดข่าวสาร')).toBe(true);
    expect(isUnsubscribeRequest('ยกเลิกข่าวสาร')).toBe(true);
    expect(isUnsubscribeRequest('ไม่รับข่าวสาร')).toBe(true);
  });

  it('จับคำอังกฤษและไม่สนตัวพิมพ์', () => {
    expect(isUnsubscribeRequest('UNSUBSCRIBE')).toBe(true);
    expect(isUnsubscribeRequest('Stop')).toBe(true);
  });

  it('มีช่องว่างแทรกก็ยังจับได้ (คนพิมพ์มือถือ)', () => {
    expect(isUnsubscribeRequest(' หยุด ข่าวสาร ')).toBe(true);
  });

  it('อยู่กลางประโยคก็นับ', () => {
    expect(isUnsubscribeRequest('ขอหยุดข่าวสารหน่อยครับ')).toBe(true);
  });

  it('ข้อความสั่งอาหารปกติไม่ถูกจับผิด', () => {
    expect(isUnsubscribeRequest('ขอเมนูหน่อยครับ')).toBe(false);
    expect(isUnsubscribeRequest('สั่งข้าวมันไก่ 2 กล่อง')).toBe(false);
    expect(isUnsubscribeRequest('')).toBe(false);
  });
});

describe('withUnsubscribeHint', () => {
  it('ต่อท้ายวิธีปฏิเสธให้อัตโนมัติ', () => {
    const out = withUnsubscribeHint('ลดราคา 20% วันนี้');
    expect(out).toContain('ลดราคา 20%');
    expect(out).toContain(UNSUBSCRIBE_HINT);
  });

  it('มีอยู่แล้วไม่ต่อซ้ำ', () => {
    const once = withUnsubscribeHint('โปรโมชัน');
    expect(withUnsubscribeHint(once)).toBe(once);
  });

  it('ข้อความยาวเกินลิมิต → ตัดเนื้อความ แต่ส่วนท้ายต้องอยู่ครบ', () => {
    const out = withUnsubscribeHint('ก'.repeat(6000));
    expect(out.length).toBeLessThanOrEqual(5000);
    expect(out).toContain(UNSUBSCRIBE_HINT);
  });
});
