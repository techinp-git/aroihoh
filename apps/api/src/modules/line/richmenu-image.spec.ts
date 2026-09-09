import { generateRichMenuImage } from './richmenu-image';
import { RICH_MENU_ZONE_PRESETS } from './richmenu';

describe('generateRichMenuImage', () => {
  it('คืน PNG (magic 89504e47) จาก preset default', () => {
    const { buffer, mime } = generateRichMenuImage(RICH_MENU_ZONE_PRESETS.default.zones, {
      brandName: 'ชิมชีวา',
      primaryColor: '#E0611C',
    });
    expect(mime).toBe('image/png');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('รูปมีขนาด 2500×1686 (อ่านจาก IHDR ของ PNG)', () => {
    const { buffer } = generateRichMenuImage(RICH_MENU_ZONE_PRESETS.member.zones, {});
    // PNG IHDR: width ที่ offset 16 (4 ไบต์ big-endian), height ที่ offset 20
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    expect(width).toBe(2500);
    expect(height).toBe(1686);
  });

  it('อยู่ในลิมิตรูป LINE (≤ 1MB)', () => {
    const { buffer } = generateRichMenuImage(RICH_MENU_ZONE_PRESETS.new_customer.zones, { brandName: 'ทดสอบ' });
    expect(buffer.byteLength).toBeLessThanOrEqual(1024 * 1024);
  });
});
