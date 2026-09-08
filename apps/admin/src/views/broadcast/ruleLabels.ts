import type { Criterion, AudienceRules } from '../../api';

// อธิบายเกณฑ์เดียวเป็นภาษาคน
export function describeCriterion(c: Criterion): string {
  switch (c.type) {
    case 'tenure_min_days':
      return c.days % 365 === 0 && c.days >= 365
        ? `เป็นสมาชิกเกิน ${c.days / 365} ปี`
        : `เป็นสมาชิกเกิน ${c.days} วัน`;
    case 'order_count_in_window':
      return `สั่ง ≥ ${c.minCount} ครั้ง ใน ${c.windowDays} วันล่าสุด`;
    case 'lapsed':
      return `หายไป: ไม่สั่ง ${c.inactiveDays} วันล่าสุด แต่เคยสั่งใน ${c.lookbackDays} วันก่อนหน้า`;
    case 'tags':
      return `มีแท็ก: ${c.tags.join(', ') || '—'}`;
    case 'points_min':
      return `มีแต้มสะสม ≥ ${c.points} แต้ม`;
    default:
      return 'เกณฑ์ไม่รู้จัก';
  }
}

export function describeRules(r: AudienceRules): string {
  if (!r.criteria?.length) return 'ลูกค้าทั้งหมด (ที่ไม่ opt-out)';
  const join = r.match === 'any' ? ' หรือ ' : ' และ ';
  return r.criteria.map(describeCriterion).join(join);
}

export const CRITERION_TYPES: { type: Criterion['type']; label: string }[] = [
  { type: 'tenure_min_days', label: 'อายุสมาชิก (เกิน N วัน)' },
  { type: 'order_count_in_window', label: 'ความถี่การสั่ง (≥ N ครั้งใน X วัน)' },
  { type: 'lapsed', label: 'ลูกค้าที่หายไป' },
  { type: 'tags', label: 'แท็กลูกค้า' },
  { type: 'points_min', label: 'แต้มสะสม (≥ N แต้ม)' },
];

// ค่าเริ่มต้นของเกณฑ์แต่ละชนิดตอนเพิ่มใหม่
export function defaultCriterion(type: Criterion['type']): Criterion {
  switch (type) {
    case 'tenure_min_days':
      return { type, days: 365 };
    case 'order_count_in_window':
      return { type, windowDays: 7, minCount: 6 };
    case 'lapsed':
      return { type, inactiveDays: 7, lookbackDays: 30 };
    case 'tags':
      return { type, tags: [] };
    case 'points_min':
      return { type, points: 100 };
  }
}
