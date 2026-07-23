/**
 * US-10 (หนี้ที่เหลือ) — Rich Menu 6 โซน
 *
 * pure builder ล้วน → ทดสอบ layout/action ได้โดยไม่ต้องมี LINE keys
 * อ้างอิงการ์ด KB "Rich Menu — ตัวอย่าง 6 โซน + JSON + action"
 *
 * ขนาดที่ LINE รองรับ: 2500×1686 (สูง, 2 แถว) หรือ 2500×843 (เตี้ย, 1 แถว)
 * เราใช้แบบสูง 2 แถว × 3 คอลัมน์ = 6 ปุ่ม ปุ่มละ 833×843
 */

/** LINE บังคับขนาดนี้เท่านั้น */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT_TALL = 1686;
export const RICH_MENU_HEIGHT_SHORT = 843;

export type RichMenuActionType = 'uri' | 'message';

export interface RichMenuBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RichMenuArea {
  bounds: RichMenuBounds;
  action: { type: RichMenuActionType; label?: string; uri?: string; text?: string };
}

export interface RichMenuObject {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: RichMenuArea[];
}

/** ช่องที่ (row, col) ในกริด 3×2 → พิกัด pixel */
export function gridBounds(row: number, col: number): RichMenuBounds {
  const w = Math.floor(RICH_MENU_WIDTH / 3); // 833
  const h = Math.floor(RICH_MENU_HEIGHT_TALL / 2); // 843
  return {
    x: col * w,
    y: row * h,
    // คอลัมน์สุดท้ายกินเศษที่เหลือ (2500 ÷ 3 ไม่ลงตัว) — ไม่งั้นขอบขวาจะมีช่องว่างกดไม่ได้
    width: col === 2 ? RICH_MENU_WIDTH - 2 * w : w,
    height: h,
  };
}

export interface RichMenuBuildOpts {
  /** LIFF ID ของแบรนด์ — ไม่มี = ปุ่มที่ต้อง deep link จะถูกตัดออก (กันปุ่มตายในเมนู) */
  liffId?: string | null;
  brandName?: string;
  /** เบอร์/ลิงก์ติดต่อร้าน (ไม่ใส่ = ใช้ปุ่มส่งข้อความหาแอดมินแทน) */
  contactUri?: string | null;
}

/** ลิงก์เข้า LIFF พร้อม path ย่อย (LIFF รองรับ query/­path ต่อท้าย) */
function liffUri(liffId: string, path?: string): string {
  return path ? `https://liff.line.me/${liffId}?p=${path}` : `https://liff.line.me/${liffId}`;
}

/**
 * สร้าง Rich Menu object 6 โซน
 * แถวบน : สั่งอาหาร · ตะกร้า · ติดตามสถานะ
 * แถวล่าง: ประวัติการสั่ง · โปรโมชัน · ติดต่อร้าน
 *
 * ปุ่มที่ต้องใช้ LIFF จะถูกตัดทิ้งถ้ายังไม่มี liffId — เมนูจะได้ไม่มีปุ่มกดแล้วเงียบ
 */
export function buildRichMenu(opts: RichMenuBuildOpts): RichMenuObject {
  const { liffId, brandName, contactUri } = opts;
  const areas: RichMenuArea[] = [];

  const add = (row: number, col: number, action: RichMenuArea['action']) =>
    areas.push({ bounds: gridBounds(row, col), action });

  if (liffId) {
    add(0, 0, { type: 'uri', label: 'สั่งอาหาร', uri: liffUri(liffId) });
    add(0, 1, { type: 'uri', label: 'ตะกร้า', uri: liffUri(liffId, 'cart') });
    add(0, 2, { type: 'uri', label: 'ติดตามสถานะ', uri: liffUri(liffId, 'track') });
    add(1, 0, { type: 'uri', label: 'ประวัติการสั่ง', uri: liffUri(liffId, 'orders') });
  } else {
    // ยังไม่มี LIFF (ก่อน SETUP-1) → ใช้ปุ่มส่งข้อความแทน ให้ auto-reply ตอบ
    add(0, 0, { type: 'message', label: 'สั่งอาหาร', text: 'เมนู' });
  }

  add(1, 1, { type: 'message', label: 'โปรโมชัน', text: 'โปรโมชัน' });

  if (contactUri) {
    add(1, 2, { type: 'uri', label: 'ติดต่อร้าน', uri: contactUri });
  } else {
    add(1, 2, { type: 'message', label: 'ติดต่อร้าน', text: 'ติดต่อแอดมิน' });
  }

  return {
    size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT_TALL },
    selected: true, // เปิดกางไว้เลยตอนลูกค้าเข้าห้องแชต
    name: `${brandName ?? 'ร้าน'} — เมนูหลัก`.slice(0, 300), // LINE จำกัด 300
    chatBarText: 'เมนู', // LINE จำกัด 14 ตัวอักษร
    areas,
  };
}

/** ตรวจก่อนส่งให้ LINE — LINE ตอบ 400 แบบไม่บอกสาเหตุ ตรวจเองชัดกว่า */
export function validateRichMenu(menu: RichMenuObject): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (menu.size.width !== RICH_MENU_WIDTH) {
    errors.push(`width ต้องเป็น ${RICH_MENU_WIDTH}`);
  }
  if (menu.size.height !== RICH_MENU_HEIGHT_TALL && menu.size.height !== RICH_MENU_HEIGHT_SHORT) {
    errors.push(`height ต้องเป็น ${RICH_MENU_HEIGHT_TALL} หรือ ${RICH_MENU_HEIGHT_SHORT}`);
  }
  if (menu.chatBarText.length === 0 || menu.chatBarText.length > 14) {
    errors.push('chatBarText ต้องยาว 1–14 ตัวอักษร');
  }
  if (menu.name.length === 0 || menu.name.length > 300) {
    errors.push('name ต้องยาว 1–300 ตัวอักษร');
  }
  if (menu.areas.length === 0 || menu.areas.length > 20) {
    errors.push('areas ต้องมี 1–20 ช่อง');
  }

  menu.areas.forEach((a, i) => {
    const { x, y, width, height } = a.bounds;
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      errors.push(`area[${i}] bounds ติดลบ/เป็นศูนย์`);
    }
    if (x + width > menu.size.width || y + height > menu.size.height) {
      errors.push(`area[${i}] ล้นออกนอกรูป`);
    }
    if (a.action.type === 'uri' && !a.action.uri) {
      errors.push(`area[${i}] action uri ว่าง`);
    }
    if (a.action.type === 'message' && !a.action.text) {
      errors.push(`area[${i}] action text ว่าง`);
    }
  });

  return { ok: errors.length === 0, errors };
}

/** พื้นที่ทับกันไหม (LINE ไม่ error แต่ปุ่มจะกินกัน กดผิดปุ่ม) */
export function findOverlaps(menu: RichMenuObject): Array<[number, number]> {
  const hits: Array<[number, number]> = [];
  const overlap = (a: RichMenuBounds, b: RichMenuBounds) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  for (let i = 0; i < menu.areas.length; i++) {
    for (let j = i + 1; j < menu.areas.length; j++) {
      if (overlap(menu.areas[i].bounds, menu.areas[j].bounds)) hits.push([i, j]);
    }
  }
  return hits;
}
