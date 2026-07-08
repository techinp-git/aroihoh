/** Pure geo helpers — ไม่มี dependency, unit-testable */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** ระยะทางวงกลมใหญ่ (Haversine) หน่วยกิโลเมตร */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** เช็คว่าจุดอยู่ในรัศมี maxKm จากจุดศูนย์กลางหรือไม่ (กลยุทธ์ radius — ADR-02) */
export function isWithinRadius(
  center: LatLng,
  point: LatLng,
  maxKm: number,
): boolean {
  return haversineKm(center, point) <= maxKm;
}
