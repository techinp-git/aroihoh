/**
 * สร้างรูปพื้นหลัง Rich Menu (2500×1686) อัตโนมัติจาก layout ปุ่ม 6 โซน
 *
 * ใช้ @napi-rs/canvas (prebuilt binary — ไม่ต้องมี system dep) + ฟอนต์ไทย Sarabun
 * (ดึงจาก @expo-google-fonts/sarabun ที่ ship .ttf จริง อยู่ใน node_modules → Docker ก๊อปไปให้เอง)
 *
 * เป็น "รูป template" ให้ร้านใช้ได้ทันที — ร้านจะเปลี่ยนเป็นงานกราฟิกสวย ๆ ทีหลังก็ได้
 */
import type { SKRSContext2D } from '@napi-rs/canvas';
import { gridBounds, RICH_MENU_WIDTH, RICH_MENU_HEIGHT_TALL, type RichMenuZone } from './richmenu';

// lazy-require @napi-rs/canvas (native binary) — ถ้าโหลดไม่ได้บนบางแพลตฟอร์ม
// จะพังเฉพาะตอน generate รูป ไม่ทำให้ทั้ง API boot ไม่ขึ้น
type CanvasLib = typeof import('@napi-rs/canvas');
let _canvas: CanvasLib | null = null;
function canvasLib(): CanvasLib {
  if (_canvas) return _canvas;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _canvas = require('@napi-rs/canvas') as CanvasLib;
  return _canvas;
}

// ลงทะเบียนฟอนต์ครั้งเดียว (idempotent) — ถ้าพลาด ปล่อยให้ใช้ฟอนต์ default (ตัวไทยอาจเป็นกล่อง)
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  try {
    const { GlobalFonts } = canvasLib();
    GlobalFonts.registerFromPath(
      require.resolve('@expo-google-fonts/sarabun/400Regular/Sarabun_400Regular.ttf'),
      'Sarabun',
    );
    GlobalFonts.registerFromPath(
      require.resolve('@expo-google-fonts/sarabun/700Bold/Sarabun_700Bold.ttf'),
      'Sarabun Bold',
    );
  } catch {
    // ไม่มีฟอนต์ = ยังวาดรูปได้ (label อาจเพี้ยน) ไม่ทำให้ทั้ง flow ล้ม
  }
  fontsReady = true;
}

/** #RRGGBB → {r,g,b} (คืนสีส้มแบรนด์ default ถ้า parse ไม่ได้) */
function hexRgb(hex?: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return { r: 224, g: 97, b: 26 }; // #E0611C ส้มชิมชีวา
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const mix = (c: number, w: number, t: number) => Math.round(c + (w - c) * t);
const rgb = (o: { r: number; g: number; b: number }) => `rgb(${o.r},${o.g},${o.b})`;

export interface GenerateImageOpts {
  brandName?: string;
  primaryColor?: string; // #RRGGBB จากธีมแบรนด์ (US-39)
}

export interface GeneratedImage {
  buffer: Buffer;
  mime: 'image/png' | 'image/jpeg';
}

/**
 * คืน PNG (หรือ JPEG ถ้าเกิน 1MB) 2500×1686 — กริด 3×2, แต่ละโซนมีแถบสีแบรนด์ + label ไทยกลางโซน
 * โซนสลับโทนอ่อน/ขาว เพื่อให้เส้นแบ่งชัด แม้พื้นหลังเรียบ
 */
export function generateRichMenuImage(zones: RichMenuZone[], opts: GenerateImageOpts = {}): GeneratedImage {
  ensureFonts();
  const W = RICH_MENU_WIDTH;
  const H = RICH_MENU_HEIGHT_TALL;
  const brand = hexRgb(opts.primaryColor);
  const tintSoft = rgb({ r: mix(brand.r, 255, 0.9), g: mix(brand.g, 255, 0.9), b: mix(brand.b, 255, 0.9) });
  const tintSofter = rgb({ r: mix(brand.r, 255, 0.96), g: mix(brand.g, 255, 0.96), b: mix(brand.b, 255, 0.96) });
  const brandStr = rgb(brand);
  const ink = '#23201C';

  const { createCanvas } = canvasLib();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // พื้นหลัง
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const use = zones.slice(0, 6);
  use.forEach((z, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const b = gridBounds(row, col);

    // พาเนลโซน (สลับโทน) + เส้นขอบ
    ctx.fillStyle = (row + col) % 2 === 0 ? tintSoft : tintSofter;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.width - 3, b.height - 3);

    // แถบสีแบรนด์ด้านบนโซน
    ctx.fillStyle = brandStr;
    ctx.fillRect(b.x, b.y, b.width, 14);

    // จุดไอคอนวงกลม (เรียบ ๆ — ร้านเปลี่ยนรูปจริงทีหลังได้)
    const cx = b.x + b.width / 2;
    const iconY = b.y + b.height * 0.36;
    ctx.beginPath();
    ctx.arc(cx, iconY, 78, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = brandStr;
    ctx.stroke();
    // เลขลำดับปุ่มในวงกลม
    ctx.fillStyle = brandStr;
    ctx.font = '700 84px "Sarabun Bold", "Sarabun", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, iconY + 4);

    // label ไทย กลางโซน (ตัดบรรทัดถ้ายาว)
    ctx.fillStyle = ink;
    ctx.font = '700 68px "Sarabun Bold", "Sarabun", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = z.label ?? '';
    const maxW = b.width - 120;
    const lines = wrapText(ctx, label, maxW);
    const lineH = 82;
    const startY = b.y + b.height * 0.72 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, li) => ctx.fillText(ln, cx, startY + li * lineH));
  });

  // ชื่อแบรนด์จาง ๆ มุมล่างขวา (กันสับสนว่าเมนูของร้านไหน)
  if (opts.brandName) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.font = '400 40px "Sarabun", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.brandName, W - 40, H - 34);
  }

  const png = canvas.toBuffer('image/png');
  // LINE จำกัดรูป ≤ 1MB — ปกติ PNG เรียบ ๆ จะเล็กมาก แต่กันไว้: เกิน → บีบเป็น JPEG
  if (png.byteLength > 1024 * 1024) {
    return { buffer: canvas.toBuffer('image/jpeg', 82), mime: 'image/jpeg' };
  }
  return { buffer: png, mime: 'image/png' };
}

/** ตัดข้อความไทยเป็นหลายบรรทัดตามความกว้าง (คร่าว ๆ ด้วยการแบ่งตามช่องว่าง + ตัดคำยาว) */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(/(\s|\/)/).filter((w) => w !== '');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur + w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur.trim());
      cur = w.trim();
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 3); // ไม่เกิน 3 บรรทัดต่อโซน
}
