import { canScanRedemptions, hasBrandAccess, SCAN_ROLES } from './staff-mode';

const B = 'brand-1';

describe('staff-mode (US-61 โหมดพนักงานใน LIFF)', () => {
  it('owner/manager/staff ที่คุมแบรนด์นี้ สแกนได้', () => {
    for (const role of SCAN_ROLES) {
      expect(canScanRedemptions(role, [B], B)).toBe(true);
    }
  });

  it('kitchen/chat_agent สแกนไม่ได้ แม้ผูกแบรนด์นี้ไว้', () => {
    expect(canScanRedemptions('kitchen', [B], B)).toBe(false);
    expect(canScanRedemptions('chat_agent', [B], B)).toBe(false);
  });

  it('staff ที่ถูกย้ายออกจากแบรนด์นี้แล้ว สแกนไม่ได้', () => {
    expect(canScanRedemptions('staff', ['brand-2'], B)).toBe(false);
  });

  it('ไม่มี brandId (เปิดนอก LIFF) = ไม่ให้ผ่าน ไม่ใช่ให้ผ่านหมด', () => {
    expect(hasBrandAccess([B], '')).toBe(false);
    expect(canScanRedemptions('owner', [B], '')).toBe(false);
  });
});
