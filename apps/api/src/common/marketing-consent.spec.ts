import { canReceiveMarketing, shouldAskConsent } from './marketing-consent';

describe('canReceiveMarketing', () => {
  it('ยินยอมแล้วและยังไม่ถอน = ส่งได้', () => {
    expect(canReceiveMarketing({ marketingOptedOut: false, marketingConsentAt: new Date() })).toBe(true);
  });

  it('ไม่เคยยินยอม = ส่งไม่ได้ (ต่างจากระบบ opt-out เดิมที่ส่งได้เลย)', () => {
    expect(canReceiveMarketing({ marketingOptedOut: false, marketingConsentAt: null })).toBe(false);
    expect(canReceiveMarketing({ marketingOptedOut: false })).toBe(false);
  });

  it('ถอนความยินยอมแล้ว = ส่งไม่ได้ แม้เคยยินยอมมาก่อน', () => {
    expect(canReceiveMarketing({ marketingOptedOut: true, marketingConsentAt: new Date('2026-01-01') })).toBe(false);
  });

  it('รับวันที่เป็นสตริง (จาก JSON) ได้', () => {
    expect(canReceiveMarketing({ marketingOptedOut: false, marketingConsentAt: '2026-01-01T00:00:00Z' })).toBe(true);
  });
});

describe('shouldAskConsent', () => {
  it('ยังไม่เคยยินยอม = ควรถาม', () => {
    expect(shouldAskConsent({ marketingOptedOut: false, marketingConsentAt: null })).toBe(true);
  });

  it('ยินยอมแบบ legacy (ยกมาจากระบบเดิม) = ควรถามจริงสักครั้ง', () => {
    expect(shouldAskConsent({
      marketingOptedOut: false, marketingConsentAt: new Date(), marketingConsentSource: 'legacy',
    })).toBe(true);
  });

  it('กดยอมรับเองแล้ว = ไม่ต้องถามอีก', () => {
    expect(shouldAskConsent({
      marketingOptedOut: false, marketingConsentAt: new Date(), marketingConsentSource: 'liff',
    })).toBe(false);
  });

  it('ปฏิเสธไปแล้ว = ไม่ตื๊อถามซ้ำ', () => {
    expect(shouldAskConsent({ marketingOptedOut: true, marketingConsentAt: null })).toBe(false);
  });
});
