/**
 * Audience rule engine — pure (unit-testable, ไม่แตะ DB)
 * ประเมิน "กลุ่มเป้าหมาย" จากพฤติกรรมลูกค้าแบบ dynamic (คำนวณสดตอน preview/ส่ง)
 * กติกาเหล็ก #6 (PDPA): คนที่ไม่ได้ยินยอม/ถอนแล้ว ถูกกันออกเสมอ ไม่ว่ากติกาจะ match หรือไม่
 */
import { canReceiveMarketing, type MarketingConsentState } from '../../common/marketing-consent';

export interface AudienceCustomer extends MarketingConsentState {
  id: string;
  createdAt: Date | string;
  tags: string[];
  orders: { createdAt: Date | string }[];
  /** US-57: แต้มคงเหลือ (ไม่มี = ถือว่า 0) */
  pointsBalance?: number;
}

/** ประเภทเกณฑ์ที่รองรับ — ปิด (bounded) เพื่อความปลอดภัย + ทดสอบได้ */
export type Criterion =
  | { type: 'tenure_min_days'; days: number } // เป็นสมาชิกมาแล้วอย่างน้อย N วัน (เช่น เกิน 1 ปี = 365)
  | { type: 'order_count_in_window'; windowDays: number; minCount: number } // สั่ง ≥ N ครั้งใน X วันล่าสุด
  | { type: 'lapsed'; inactiveDays: number; lookbackDays: number } // หายไป: ไม่สั่งใน inactiveDays แต่เคยสั่งใน lookbackDays ก่อนหน้า
  | { type: 'tags'; tags: string[] } // มีแท็กตรงอย่างน้อย 1
  | { type: 'points_min'; points: number }; // US-57: มีแต้มสะสม ≥ N (ชวนมาแลกของรางวัล)

export interface AudienceRules {
  match: 'all' | 'any'; // AND / OR ระหว่างเกณฑ์
  criteria: Criterion[];
}

const DAY = 86_400_000;
const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** เกณฑ์เดียว match ลูกค้าคนนี้ไหม (ณ เวลา nowMs) */
export function matchesCriterion(c: Criterion, cust: AudienceCustomer, nowMs: number): boolean {
  switch (c.type) {
    case 'tenure_min_days':
      return nowMs - ms(cust.createdAt) >= c.days * DAY;

    case 'order_count_in_window': {
      const since = nowMs - c.windowDays * DAY;
      const n = cust.orders.filter((o) => ms(o.createdAt) >= since).length;
      return n >= c.minCount;
    }

    case 'lapsed': {
      const inactiveCut = nowMs - c.inactiveDays * DAY; // ไม่ควรมีออเดอร์หลังจุดนี้
      const lookbackStart = inactiveCut - c.lookbackDays * DAY;
      const recent = cust.orders.some((o) => ms(o.createdAt) >= inactiveCut);
      if (recent) return false; // ยังสั่งอยู่ = ไม่ถือว่าหาย
      const wasActive = cust.orders.some((o) => {
        const t = ms(o.createdAt);
        return t >= lookbackStart && t < inactiveCut;
      });
      return wasActive; // เคยสั่งช่วงก่อนหน้า แล้วเงียบ
    }

    case 'tags': {
      const wanted = c.tags.filter((t) => t.trim());
      if (wanted.length === 0) return true;
      return cust.tags.some((t) => wanted.includes(t));
    }

    case 'points_min':
      return (cust.pointsBalance ?? 0) >= c.points;

    default:
      return false;
  }
}

/** ลูกค้าคนนี้เข้ากลุ่มเป้าหมายนี้ไหม — คนที่ส่งการตลาดไม่ได้ ตัดทิ้งก่อนเสมอ (#6) */
export function matchesAudience(cust: AudienceCustomer, rules: AudienceRules, nowMs: number): boolean {
  if (!canReceiveMarketing(cust)) return false;
  const crit = rules.criteria ?? [];
  if (crit.length === 0) return true; // ไม่มีเกณฑ์ = ทุกคนที่ส่งได้
  const results = crit.map((c) => matchesCriterion(c, cust, nowMs));
  return rules.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/** คืนรายชื่อลูกค้าที่เข้ากลุ่ม */
export function resolveAudienceByRules<T extends AudienceCustomer>(
  customers: T[],
  rules: AudienceRules,
  nowMs: number,
): T[] {
  return customers.filter((c) => matchesAudience(c, rules, nowMs));
}

/** preset ตัวอย่างตามที่ธุรกิจอยากได้ — ใช้เป็นปุ่มลัดใน UI */
export const AUDIENCE_PRESETS: { key: string; name: string; rules: AudienceRules }[] = [
  {
    key: 'member_over_1y',
    name: 'สมาชิกเกิน 1 ปี',
    rules: { match: 'all', criteria: [{ type: 'tenure_min_days', days: 365 }] },
  },
  {
    key: 'frequent_this_week',
    name: 'สั่งบ่อยสัปดาห์นี้ (>5 ครั้ง/7 วัน)',
    rules: { match: 'all', criteria: [{ type: 'order_count_in_window', windowDays: 7, minCount: 6 }] },
  },
  {
    key: 'lapsed_last_week',
    name: 'หายไปสัปดาห์นี้ (เคยสั่งแต่เงียบ 7 วัน)',
    rules: { match: 'all', criteria: [{ type: 'lapsed', inactiveDays: 7, lookbackDays: 30 }] },
  },
];

/** ตรวจ rules ให้ถูกรูปแบบก่อนบันทึก (กัน payload พัง/ค่าติดลบ) */
export function validateRules(rules: unknown): AudienceRules {
  const r = rules as AudienceRules;
  if (!r || (r.match !== 'all' && r.match !== 'any') || !Array.isArray(r.criteria)) {
    throw new Error('rules ต้องมี match=all|any และ criteria เป็น array');
  }
  if (r.criteria.length > 10) throw new Error('เกณฑ์มากเกินไป (สูงสุด 10)');
  for (const c of r.criteria) {
    switch (c.type) {
      case 'tenure_min_days':
        if (!(c.days >= 0)) throw new Error('tenure_min_days.days ต้อง ≥ 0');
        break;
      case 'order_count_in_window':
        if (!(c.windowDays > 0) || !(c.minCount >= 1))
          throw new Error('order_count_in_window ต้อง windowDays>0, minCount≥1');
        break;
      case 'lapsed':
        if (!(c.inactiveDays > 0) || !(c.lookbackDays > 0))
          throw new Error('lapsed ต้อง inactiveDays>0, lookbackDays>0');
        break;
      case 'tags':
        if (!Array.isArray(c.tags)) throw new Error('tags ต้องเป็น array');
        break;
      case 'points_min':
        if (!(c.points >= 1)) throw new Error('points_min.points ต้อง ≥ 1');
        break;
      default:
        throw new Error(`ไม่รู้จักเกณฑ์: ${(c as { type: string }).type}`);
    }
  }
  return r;
}
