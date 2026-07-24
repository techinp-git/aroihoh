import { extForContentType, safeMediaName, contentTypeForName } from './media.filename';

describe('extForContentType', () => {
  it('map ชนิดรูปเป็นนามสกุล', () => {
    expect(extForContentType('image/jpeg')).toBe('.jpg');
    expect(extForContentType('image/png')).toBe('.png');
    expect(extForContentType('image/webp')).toBe('.webp');
  });
  it('มี charset ต่อท้ายก็ยังอ่านออก', () => {
    expect(extForContentType('image/png; charset=binary')).toBe('.png');
  });
  it('ไม่รู้จัก/ว่าง → default jpg (LINE image เป็น jpeg)', () => {
    expect(extForContentType(null)).toBe('.jpg');
    expect(extForContentType('application/octet-stream')).toBe('.jpg');
  });
});

describe('safeMediaName', () => {
  it('ชื่อไฟล์ปกติผ่าน', () => {
    expect(safeMediaName('abc123-def.jpg')).toBe('abc123-def.jpg');
    expect(safeMediaName('IMG_001.png')).toBe('IMG_001.png');
  });
  it('กัน path traversal', () => {
    expect(safeMediaName('../../etc/passwd')).toBeNull();
    expect(safeMediaName('../secret.jpg')).toBe('secret.jpg'); // ตัด path เหลือ basename
    expect(safeMediaName('/abs/path/x.jpg')).toBe('x.jpg');
    expect(safeMediaName('a/b/c.png')).toBe('c.png');
  });
  it('นามสกุลไม่ใช่รูป = null', () => {
    expect(safeMediaName('shell.sh')).toBeNull();
    expect(safeMediaName('x.js')).toBeNull();
    expect(safeMediaName('noext')).toBeNull();
  });
  it('ชื่อมีอักขระแปลก = null', () => {
    expect(safeMediaName('a b.jpg')).toBeNull();
    expect(safeMediaName('a;rm.jpg')).toBeNull();
    expect(safeMediaName('.jpg')).toBeNull(); // ไม่มี stem
  });
  it('ค่าว่าง = null', () => {
    expect(safeMediaName('')).toBeNull();
  });
});

describe('contentTypeForName', () => {
  it('คืน content-type ตามนามสกุล', () => {
    expect(contentTypeForName('x.png')).toBe('image/png');
    expect(contentTypeForName('x.jpg')).toBe('image/jpeg');
    expect(contentTypeForName('x.webp')).toBe('image/webp');
  });
});
