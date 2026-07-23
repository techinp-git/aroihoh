import {
  buildOrderConfirmFlex,
  orderConfirmAltText,
  formatBaht,
  shortOrderNo,
  statusUpdateText,
  shouldNotify,
  isKnownStatus,
  type FlexOrderInput,
} from './flex';

const order: FlexOrderInput = {
  id: '3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6071',
  status: 'confirmed',
  subtotal: 12000, // 120.00
  deliveryFee: 2000, // 20.00
  discount: 0,
  total: 14000, // 140.00
  paymentMethod: 'cod',
  note: 'ไม่ใส่ผัก',
  items: [
    { nameSnapshot: 'แกงเขียวหวานไก่', qty: 1, lineTotal: 6000 },
    { nameSnapshot: 'ผัดซีอิ๊วหมู', qty: 1, lineTotal: 6000 },
  ],
};

describe('formatBaht', () => {
  it('ตัด .00 ทิ้งให้อ่านง่าย', () => {
    expect(formatBaht(6000)).toBe('60');
    expect(formatBaht(14000)).toBe('140');
  });

  it('เก็บทศนิยมเมื่อมีเศษสตางค์', () => {
    expect(formatBaht(12350)).toBe('123.50');
  });

  it('ศูนย์บาท', () => {
    expect(formatBaht(0)).toBe('0');
  });
});

describe('shortOrderNo', () => {
  it('ย่อ uuid เหลือ 8 ตัวพิมพ์ใหญ่', () => {
    expect(shortOrderNo(order.id)).toBe('3F2A1B4C');
  });
});

describe('buildOrderConfirmFlex', () => {
  it('เป็น bubble ที่มี header/body ครบ', () => {
    const b = buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา', liffId: '123-abc' });
    expect(b.type).toBe('bubble');
    expect(b.header).toBeDefined();
    expect(b.body).toBeDefined();
  });

  it('ใส่ปุ่มดูสถานะ deep link เข้า LIFF พร้อม orderId', () => {
    const b = buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา', liffId: '123-abc' });
    const json = JSON.stringify(b);
    expect(json).toContain('https://liff.line.me/123-abc?orderId=' + order.id);
    expect(json).toContain('ดูสถานะออเดอร์');
  });

  it('ไม่มี liffId → ไม่มี footer/ปุ่ม (กัน deep link เสีย)', () => {
    const b = buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา', liffId: null });
    expect(b.footer).toBeUndefined();
  });

  it('ใช้สีแบรนด์จาก theme (US-39)', () => {
    const b = buildOrderConfirmFlex(order, { brandName: 'A La Carte', primaryColor: '#222222' });
    expect(JSON.stringify(b)).toContain('#222222');
  });

  it('แสดงยอดตามที่ server คำนวณมา ไม่คำนวณใหม่ (กติกาเหล็ก #2)', () => {
    const json = JSON.stringify(buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา' }));
    expect(json).toContain('140'); // total
    expect(json).toContain('120'); // subtotal
    expect(json).toContain('20'); // delivery fee
  });

  it('ค่าส่ง 0 แสดงว่า "ฟรี"', () => {
    const free = { ...order, deliveryFee: 0 };
    expect(JSON.stringify(buildOrderConfirmFlex(free, { brandName: 'ชิมชีวา' }))).toContain('ฟรี');
  });

  it('โชว์ส่วนลดเฉพาะเมื่อมี', () => {
    const noDiscount = JSON.stringify(buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา' }));
    expect(noDiscount).not.toContain('ส่วนลด');
    const withDiscount = JSON.stringify(
      buildOrderConfirmFlex({ ...order, discount: 1000 }, { brandName: 'ชิมชีวา' }),
    );
    expect(withDiscount).toContain('ส่วนลด');
    expect(withDiscount).toContain('-10');
  });

  it('มีรายการอาหารครบทุกแถว', () => {
    const json = JSON.stringify(buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา' }));
    expect(json).toContain('แกงเขียวหวานไก่ ×1');
    expect(json).toContain('ผัดซีอิ๊วหมู ×1');
  });

  it('ไม่มี note → ไม่มีบรรทัดหมายเหตุ', () => {
    const json = JSON.stringify(buildOrderConfirmFlex({ ...order, note: null }, { brandName: 'ชิมชีวา' }));
    expect(json).not.toContain('📝');
  });

  it('COD กับ PromptPay ขึ้นข้อความต่างกัน', () => {
    const cod = JSON.stringify(buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา' }));
    expect(cod).toContain('เก็บเงินปลายทาง');
    const pp = JSON.stringify(
      buildOrderConfirmFlex({ ...order, paymentMethod: 'promptpay' }, { brandName: 'ชิมชีวา' }),
    );
    expect(pp).toContain('PromptPay');
  });

  it('ไม่มี PII (เบอร์/พิกัด) ในบับเบิล — PDPA #6', () => {
    const json = JSON.stringify(buildOrderConfirmFlex(order, { brandName: 'ชิมชีวา', liffId: 'x' }));
    expect(json).not.toMatch(/0\d{8,9}/); // เบอร์มือถือไทย
    expect(json).not.toContain('lat');
    expect(json).not.toContain('lng');
  });
});

describe('orderConfirmAltText', () => {
  it('สรุปสั้นและไม่เกิน 400 ตัวอักษร (ลิมิต LINE)', () => {
    const alt = orderConfirmAltText(order);
    expect(alt).toContain('3F2A1B4C');
    expect(alt).toContain('140');
    expect(alt.length).toBeLessThanOrEqual(400);
  });
});

describe('statusUpdateText', () => {
  it('ยกเลิก/สำเร็จ มีข้อความเฉพาะ', () => {
    expect(statusUpdateText({ id: order.id, status: 'cancelled' }, 'ชิมชีวา')).toContain('ยกเลิก');
    expect(statusUpdateText({ id: order.id, status: 'completed' }, 'ชิมชีวา')).toContain('ส่งสำเร็จ');
  });

  it('สถานะอื่นใช้ป้ายไทยมาตรฐาน', () => {
    expect(statusUpdateText({ id: order.id, status: 'delivering' }, 'ชิมชีวา')).toContain('กำลังจัดส่ง');
  });
});

describe('shouldNotify', () => {
  it('แจ้งเฉพาะสถานะสำคัญ — ประหยัดโควตา push', () => {
    expect(shouldNotify('confirmed')).toBe(true);
    expect(shouldNotify('delivering')).toBe(true);
    expect(shouldNotify('completed')).toBe(true);
    expect(shouldNotify('cancelled')).toBe(true);
  });

  it('ไม่แจ้งสถานะกลางทางที่ลูกค้าไม่ต้องรู้ทันที', () => {
    expect(shouldNotify('pending')).toBe(false);
    expect(shouldNotify('preparing')).toBe(false);
    expect(shouldNotify('ready')).toBe(false);
  });
});

describe('isKnownStatus', () => {
  it('รับสถานะที่มีจริง', () => {
    expect(isKnownStatus('ready')).toBe(true);
    expect(isKnownStatus('cancelled')).toBe(true);
  });

  it('ปฏิเสธค่าที่ไม่รู้จัก', () => {
    expect(isKnownStatus('exploded')).toBe(false);
  });
});
