import { haversineKm, isWithinRadius } from './geo';

describe('haversineKm', () => {
  it('ระยะจากจุดเดียวกัน = 0', () => {
    expect(haversineKm({ lat: 13.75, lng: 100.5 }, { lat: 13.75, lng: 100.5 })).toBe(0);
  });

  it('1 องศาละติจูด ≈ 111.2 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 0);
  });

  it('สมมาตร: a→b เท่ากับ b→a', () => {
    const a = { lat: 13.7563, lng: 100.5018 };
    const b = { lat: 13.765, lng: 100.538 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('isWithinRadius', () => {
  const center = { lat: 13.7563, lng: 100.5018 };

  it('จุดศูนย์กลางอยู่ในเขตเสมอ', () => {
    expect(isWithinRadius(center, center, 5)).toBe(true);
  });

  it('จุดไกลเกินรัศมี = นอกเขต', () => {
    expect(isWithinRadius(center, { lat: 14.5, lng: 100.5 }, 5)).toBe(false);
  });
});
