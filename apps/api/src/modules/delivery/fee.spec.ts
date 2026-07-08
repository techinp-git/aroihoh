import { computeDeliveryFee } from './fee';

describe('computeDeliveryFee', () => {
  it('flat: ค่าส่งคงที่ไม่ขึ้นกับระยะ', () => {
    const rule = { type: 'flat' as const, params: { fee: 2000 } };
    expect(computeDeliveryFee(rule, 0.5)).toBe(2000);
    expect(computeDeliveryFee(rule, 8)).toBe(2000);
  });

  it('per_km: base + ceil(กม.ที่คิด) * perKm (มี freeKm)', () => {
    const rule = {
      type: 'per_km' as const,
      params: { baseFee: 1000, perKm: 500, freeKm: 1 },
    };
    // dist 3.4, free 1 → charged 2.4 → ceil 3 → 1000 + 1500 = 2500
    expect(computeDeliveryFee(rule, 3.4)).toBe(2500);
    // อยู่ใน freeKm → คิดแค่ base
    expect(computeDeliveryFee(rule, 0.8)).toBe(1000);
  });

  it('tiered: เลือก tier แรกที่ครอบระยะ', () => {
    const rule = {
      type: 'tiered' as const,
      params: {
        tiers: [
          { maxKm: 3, fee: 1500 },
          { maxKm: 6, fee: 2500 },
        ],
      },
    };
    expect(computeDeliveryFee(rule, 2)).toBe(1500);
    expect(computeDeliveryFee(rule, 4)).toBe(2500);
  });

  it('tiered: เกิน tier สุดท้ายและไม่มี beyondFee → null (นอกเขต)', () => {
    const rule = {
      type: 'tiered' as const,
      params: { tiers: [{ maxKm: 6, fee: 2500 }] },
    };
    expect(computeDeliveryFee(rule, 8)).toBeNull();
  });

  it('tiered: เกิน tier แต่มี beyondFee → ใช้ beyondFee', () => {
    const rule = {
      type: 'tiered' as const,
      params: { tiers: [{ maxKm: 6, fee: 2500 }], beyondFee: 4000 },
    };
    expect(computeDeliveryFee(rule, 8)).toBe(4000);
  });
});
