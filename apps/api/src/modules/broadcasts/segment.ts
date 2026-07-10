/**
 * Broadcast audience resolution — pure (unit-testable, ไม่แตะ DB)
 * กติกาเหล็ก #6 (PDPA): ต้องหักลูกค้าที่ opt-out ออกเสมอ ห้ามส่งถึงคนที่ปฏิเสธ
 */

export interface AudienceCustomer {
  id: string;
  tags: string[];
  marketingOptedOut: boolean;
}

/** เกณฑ์กลุ่มเป้าหมาย — null/ไม่มี tags = ทุกคน (ที่ไม่ opt-out) */
export interface Segment {
  tags?: string[];
}

/**
 * คืนเฉพาะลูกค้าที่ "ส่งได้จริง":
 *  1. ไม่ opt-out (PDPA — บังคับเสมอ)
 *  2. ถ้าระบุ segment.tags → ต้องมีแท็กตรงอย่างน้อย 1 (intersection)
 * segment ว่าง/ไม่มี tags → ทุกคนที่ไม่ opt-out
 */
export function resolveAudience<T extends AudienceCustomer>(
  customers: T[],
  segment?: Segment | null,
): T[] {
  const wanted = segment?.tags?.filter((t) => t.trim()) ?? [];
  return customers.filter((c) => {
    if (c.marketingOptedOut) return false; // #6 PDPA — ไม่มีข้อยกเว้น
    if (wanted.length === 0) return true;
    return c.tags.some((t) => wanted.includes(t));
  });
}

/** dedupeKey สำหรับ message_logs — กันส่งซ้ำ 1 broadcast ต่อ 1 ลูกค้า (กติกาเหล็ก #7) */
export function dedupeKeyFor(broadcastId: string, customerId: string): string {
  return `bcast:${broadcastId}:${customerId}`;
}
