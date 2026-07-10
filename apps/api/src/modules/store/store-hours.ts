/** US-16: ตรรกะเวลาทำการ + พักรับออเดอร์ — pure, unit-testable */

export interface StoreState {
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

/** อยู่ในเวลาทำการไหม (hhmm = "HH:MM") — ไม่ตั้งเวลา = เปิดตลอด · ไม่รองรับข้ามเที่ยงคืน */
export function withinHours(
  openTime: string | null,
  closeTime: string | null,
  hhmm: string,
): boolean {
  if (!openTime || !closeTime) return true;
  return hhmm >= openTime && hhmm <= closeTime;
}

/** ร้านรับออเดอร์ได้ไหม ณ เวลานี้ */
export function isAccepting(
  store: StoreState,
  hhmm: string,
): { ok: boolean; reason?: string } {
  if (!store.isOpen) return { ok: false, reason: 'ร้านพักรับออเดอร์ชั่วคราว' };
  if (!withinHours(store.openTime, store.closeTime, hhmm)) {
    return { ok: false, reason: `นอกเวลาทำการ (${store.openTime}–${store.closeTime})` };
  }
  return { ok: true };
}

/** เวลาปัจจุบันแบบ "HH:MM" ตามเวลาไทย */
export function nowHHMMBangkok(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}
