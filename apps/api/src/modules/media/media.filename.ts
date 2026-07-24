import { extname } from 'path';

// ชนิดรูปที่รับจาก LINE → นามสกุลไฟล์ (LINE image message เป็น jpeg เสมอ แต่กันเหนียว)
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export function extForContentType(contentType: string | null): string {
  const t = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return EXT_BY_TYPE[t] ?? '.jpg';
}

/**
 * ทำให้ชื่อไฟล์ที่รับมา (จาก DB) ปลอดภัยก่อนเอาไปต่อ path จริง
 * กัน path traversal (../, /etc/..) — คืน basename ที่มีแต่ [a-z0-9-] + นามสกุลรูปที่อนุญาต
 * ไม่ผ่านเกณฑ์ = คืน null (ให้ caller ตอบ 404 ไม่ใช่เผลอเปิดไฟล์นอกโฟลเดอร์)
 */
export function safeMediaName(name: string): string | null {
  if (!name) return null;
  // ตัดทุกส่วนของ path ทิ้ง เหลือแต่ชื่อไฟล์ล้วน
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const ext = extname(base).toLowerCase();
  const stem = base.slice(0, base.length - ext.length);
  const okExt = ['.jpg', '.png', '.gif', '.webp'].includes(ext);
  const okStem = /^[A-Za-z0-9_-]+$/.test(stem);
  return okExt && okStem ? base : null;
}

export function contentTypeForName(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}
