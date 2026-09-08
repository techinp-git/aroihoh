import {
  buildRichMenu,
  validateRichMenu,
  findOverlaps,
  gridBounds,
  RICH_MENU_WIDTH,
  RICH_MENU_HEIGHT_TALL,
} from './richmenu';

describe('gridBounds', () => {
  it('ช่องซ้ายบนเริ่มที่ (0,0)', () => {
    expect(gridBounds(0, 0)).toEqual({ x: 0, y: 0, width: 833, height: 843 });
  });

  it('แถวล่างเริ่มที่ y = ครึ่งความสูง', () => {
    expect(gridBounds(1, 0).y).toBe(843);
  });

  it('คอลัมน์สุดท้ายกินเศษที่เหลือ — ขอบขวาไม่มีช่องว่างกดไม่ได้', () => {
    const last = gridBounds(0, 2);
    expect(last.x + last.width).toBe(RICH_MENU_WIDTH); // 2500 พอดี ไม่ใช่ 2499
    expect(last.width).toBe(834);
  });

  it('3 คอลัมน์รวมกันได้ความกว้างเต็ม', () => {
    const total = [0, 1, 2].reduce((a, c) => a + gridBounds(0, c).width, 0);
    expect(total).toBe(RICH_MENU_WIDTH);
  });
});

describe('buildRichMenu — มี liffId', () => {
  const menu = buildRichMenu({ liffId: 'abc-123', brandName: 'ชิมชีวา' });

  it('ได้ 6 ปุ่มครบ', () => {
    expect(menu.areas).toHaveLength(6);
  });

  it('ขนาดตรงสเปค LINE', () => {
    expect(menu.size).toEqual({ width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT_TALL });
  });

  it('ปุ่ม LIFF deep link ใช้ scheme ?view= ที่ apps/liff รองรับ', () => {
    const uris = menu.areas.filter((a) => a.action.type === 'uri').map((a) => a.action.uri);
    expect(uris).toContain('https://liff.line.me/abc-123'); // สั่งอาหาร → หน้าเมนู
    expect(uris).toContain('https://liff.line.me/abc-123?view=points'); // แต้มสะสม
    expect(uris).toContain('https://liff.line.me/abc-123?view=profile'); // โปรไฟล์/ออเดอร์
  });

  it('ไม่มี ?p= ตกค้าง (scheme เก่าที่ LIFF app อ่านไม่ออก → ปุ่มตกไปหน้าเมนู)', () => {
    const uris = menu.areas.map((a) => a.action.uri ?? '');
    expect(uris.some((u) => u.includes('?p='))).toBe(false);
  });

  it('ชื่อเมนูมีชื่อแบรนด์ + chatBarText ไม่เกิน 14 ตัว (ลิมิต LINE)', () => {
    expect(menu.name).toContain('ชิมชีวา');
    expect(menu.chatBarText.length).toBeLessThanOrEqual(14);
  });

  it('selected=true — กางเมนูให้เลยตอนเข้าห้องแชต', () => {
    expect(menu.selected).toBe(true);
  });

  it('ผ่าน validate และไม่มีปุ่มทับกัน', () => {
    expect(validateRichMenu(menu).ok).toBe(true);
    expect(findOverlaps(menu)).toEqual([]);
  });
});

describe('buildRichMenu — ยังไม่มี liffId (ก่อน SETUP-1)', () => {
  const menu = buildRichMenu({ liffId: null, brandName: 'ชิมชีวา' });

  it('ตัดปุ่มที่ต้อง deep link ทิ้ง — ไม่ให้มีปุ่มกดแล้วเงียบ', () => {
    expect(menu.areas.every((a) => a.action.type !== 'uri' || !!a.action.uri)).toBe(true);
    expect(menu.areas.some((a) => a.action.uri?.includes('liff.line.me'))).toBe(false);
  });

  it('ใช้ปุ่มส่งข้อความแทน ให้ auto-reply ตอบได้', () => {
    const texts = menu.areas.map((a) => a.action.text);
    expect(texts).toContain('เมนู'); // ตรงกับ keyword ใน autoReplyText
  });

  it('ยังผ่าน validate (เมนูใช้งานได้จริงแม้ยังไม่มี LIFF)', () => {
    expect(validateRichMenu(menu).ok).toBe(true);
  });
});

describe('buildRichMenu — ปุ่มติดต่อ', () => {
  it('มี contactUri → ใช้ลิงก์นั้น', () => {
    const m = buildRichMenu({ liffId: 'x', contactUri: 'https://line.me/ti/p/@shop' });
    expect(m.areas.some((a) => a.action.uri === 'https://line.me/ti/p/@shop')).toBe(true);
  });

  it('ไม่มี contactUri → ตกไปใช้ปุ่มส่งข้อความ ไม่ปล่อยปุ่มว่าง', () => {
    const m = buildRichMenu({ liffId: 'x' });
    expect(m.areas.some((a) => a.action.text === 'ติดต่อแอดมิน')).toBe(true);
  });
});

describe('validateRichMenu', () => {
  const base = buildRichMenu({ liffId: 'x' });

  it('จับ chatBarText ยาวเกิน 14', () => {
    const bad = { ...base, chatBarText: 'ก'.repeat(15) };
    expect(validateRichMenu(bad).ok).toBe(false);
    expect(validateRichMenu(bad).errors.join()).toContain('chatBarText');
  });

  it('จับ chatBarText ว่าง', () => {
    expect(validateRichMenu({ ...base, chatBarText: '' }).ok).toBe(false);
  });

  it('จับขนาดรูปผิดสเปค (ทั้ง width และ height)', () => {
    const bad = { ...base, size: { width: 1200, height: 800 } };
    const r = validateRichMenu(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('width ต้องเป็น');
    expect(r.errors.join()).toContain('height ต้องเป็น');
  });

  it('ยอมรับความสูงแบบเตี้ย 843', () => {
    const short = { ...base, size: { width: 2500, height: 843 } };
    // areas ของ base สูง 843 เริ่มที่ y=843 จะล้น → ตรวจเฉพาะว่าไม่บ่นเรื่อง height
    expect(validateRichMenu(short).errors.join()).not.toContain('height ต้องเป็น');
  });

  it('จับปุ่มล้นออกนอกรูป', () => {
    const bad = {
      ...base,
      areas: [{ bounds: { x: 2400, y: 0, width: 500, height: 100 }, action: { type: 'message' as const, text: 'x' } }],
    };
    expect(validateRichMenu(bad).errors.join()).toContain('ล้นออกนอกรูป');
  });

  it('จับ action uri ว่าง', () => {
    const bad = {
      ...base,
      areas: [{ bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'uri' as const } }],
    };
    expect(validateRichMenu(bad).errors.join()).toContain('uri ว่าง');
  });

  it('จับ areas ว่าง', () => {
    expect(validateRichMenu({ ...base, areas: [] }).ok).toBe(false);
  });
});

describe('findOverlaps', () => {
  it('เจอปุ่มที่ทับกัน (กดแล้วกินกัน)', () => {
    const m = buildRichMenu({ liffId: 'x' });
    const overlapping = {
      ...m,
      areas: [
        { bounds: { x: 0, y: 0, width: 900, height: 900 }, action: { type: 'message' as const, text: 'a' } },
        { bounds: { x: 800, y: 800, width: 900, height: 800 }, action: { type: 'message' as const, text: 'b' } },
      ],
    };
    expect(findOverlaps(overlapping)).toEqual([[0, 1]]);
  });

  it('ปุ่มติดกันพอดี (ขอบชนกัน) ไม่นับว่าทับ', () => {
    const m = buildRichMenu({ liffId: 'x' });
    expect(findOverlaps(m)).toEqual([]);
  });
});
