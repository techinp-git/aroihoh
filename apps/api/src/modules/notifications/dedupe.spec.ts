import {
  buildDedupeKey,
  parseDedupeKey,
  isRetryableStatus,
  backoffMs,
  isValidJob,
  NOTIFY_KINDS,
} from './dedupe';

const ORDER = '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071';

describe('buildDedupeKey', () => {
  it('ใบยืนยัน = 1 ใบต่อ 1 ออเดอร์ (ไม่ขึ้นกับสถานะ)', () => {
    expect(buildDedupeKey('order_confirm', ORDER)).toBe(`confirm:${ORDER}`);
    expect(buildDedupeKey('order_confirm', ORDER, 'confirmed')).toBe(`confirm:${ORDER}`);
  });

  it('แจ้งสถานะ = 1 ครั้งต่อ (ออเดอร์, สถานะ)', () => {
    expect(buildDedupeKey('status_push', ORDER, 'delivering')).toBe(`status:${ORDER}:delivering`);
  });

  it('สถานะต่างกัน → key ต่างกัน (ส่งได้ทั้งคู่)', () => {
    expect(buildDedupeKey('status_push', ORDER, 'confirmed')).not.toBe(
      buildDedupeKey('status_push', ORDER, 'completed'),
    );
  });

  it('เรียกซ้ำสถานะเดิม → key เดิม (DB unique จะกันซ้ำให้)', () => {
    expect(buildDedupeKey('status_push', ORDER, 'confirmed')).toBe(buildDedupeKey('status_push', ORDER, 'confirmed'));
  });

  it('ออเดอร์คนละใบ → key คนละอัน', () => {
    expect(buildDedupeKey('order_confirm', ORDER)).not.toBe(buildDedupeKey('order_confirm', 'other-id'));
  });
});

describe('parseDedupeKey', () => {
  it('แกะ confirm key ได้', () => {
    expect(parseDedupeKey(`confirm:${ORDER}`)).toEqual({ kind: 'order_confirm', orderId: ORDER });
  });

  it('แกะ status key ได้', () => {
    expect(parseDedupeKey(`status:${ORDER}:ready`)).toEqual({
      kind: 'status_push',
      orderId: ORDER,
      status: 'ready',
    });
  });

  it('key ที่ไม่รู้จัก (เช่นของ broadcast) → null', () => {
    expect(parseDedupeKey('bcast:abc:1')).toBeNull();
    expect(parseDedupeKey('ขยะ')).toBeNull();
  });
});

describe('isRetryableStatus', () => {
  it('429 rate limit → retry', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('5xx ฝั่ง LINE → retry', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('4xx อื่น (token ผิด/payload พัง) → ไม่ retry เปลืองโควตา', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('backoffMs', () => {
  it('เพิ่มแบบ exponential', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
  });

  it('มีเพดาน ไม่หน่วงนานเกินไป', () => {
    expect(backoffMs(20)).toBe(60000);
  });

  it('attempt ต่ำกว่า 1 → base', () => {
    expect(backoffMs(0)).toBe(2000);
  });
});

describe('isValidJob', () => {
  const valid = { kind: 'order_confirm', brandId: 'b1', orderId: ORDER, messageLogId: 'm1' };

  it('รับ payload ที่ครบ', () => {
    expect(isValidJob(valid)).toBe(true);
  });

  // regression: เคยเพิ่ม points_earned เข้า type แล้วลืมแก้ isValidJob → worker ทิ้ง job แจ้งแต้มทั้งหมด
  // (พังเฉพาะ prod เพราะ dev/CI ไม่มี Redis เลยวิ่งโหมด inline ที่ข้ามตัวตรวจนี้ไป)
  it.each(NOTIFY_KINDS)('รับทุกชนิดที่ประกาศไว้: %s', (kind) => {
    expect(isValidJob({ ...valid, kind })).toBe(true);
  });

  it('ปฏิเสธ job เก่า/พังที่ค้างในคิว', () => {
    expect(isValidJob(null)).toBe(false);
    expect(isValidJob({})).toBe(false);
    expect(isValidJob({ ...valid, kind: 'ของเก่า' })).toBe(false);
    expect(isValidJob({ ...valid, messageLogId: undefined })).toBe(false);
    expect(isValidJob({ ...valid, brandId: 123 })).toBe(false);
  });
});
