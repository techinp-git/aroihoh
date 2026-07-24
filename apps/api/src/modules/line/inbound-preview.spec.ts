import { inboundPlaceholder, conversationPreview } from './inbound-preview';

describe('inboundPlaceholder', () => {
  it('รูป/สติกเกอร์/ตำแหน่ง มีป้ายเฉพาะ', () => {
    expect(inboundPlaceholder('image')).toBe('[รูปภาพ]');
    expect(inboundPlaceholder('sticker')).toBe('[สติกเกอร์]');
    expect(inboundPlaceholder('location')).toBe('[ตำแหน่งที่ตั้ง]');
  });
  it('ชนิดอื่นมี fallback', () => {
    expect(inboundPlaceholder('video')).toBe('[วิดีโอ]');
    expect(inboundPlaceholder('weird')).toBe('[ข้อความ]');
  });
});

describe('conversationPreview', () => {
  it('มีรูป → โชว์ป้ายรูป ไม่สนใจ text', () => {
    expect(conversationPreview('', 'x.jpg')).toBe('[รูปภาพ]');
    expect(conversationPreview('อะไรก็ตาม', 'x.jpg')).toBe('[รูปภาพ]');
  });
  it('ไม่มีรูป → โชว์ text ตามเดิม', () => {
    expect(conversationPreview('สวัสดีครับ', null)).toBe('สวัสดีครับ');
  });
});
