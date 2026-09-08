import { resolveAudience, dedupeKeyFor } from './segment';

// ลูกค้าที่ยินยอมรับข่าวสารแล้ว (ค่าเริ่มต้น) — PDPA: ไม่ยินยอม = ไม่เข้ากลุ่มผู้รับ
const c = (id: string, tags: string[], optedOut = false) => ({
  id, tags, marketingOptedOut: optedOut, marketingConsentAt: new Date('2026-01-01'),
});
/** ยังไม่เคยยินยอม (ลูกค้าใหม่หลังเปลี่ยนเป็น opt-in) */
const cNoConsent = (id: string, tags: string[] = []) => ({
  id, tags, marketingOptedOut: false, marketingConsentAt: null,
});

describe('resolveAudience', () => {
  const base = [
    c('a', ['vip']),
    c('b', ['ประจำ']),
    c('c', ['vip', 'ประจำ']),
    c('d', []),
    c('e', ['vip'], true), // opt-out
  ];

  it('ไม่มี segment → ทุกคนที่ไม่ opt-out', () => {
    const r = resolveAudience(base).map((x) => x.id);
    expect(r).toEqual(['a', 'b', 'c', 'd']);
    expect(r).not.toContain('e');
  });

  it('segment tags → เฉพาะคนที่มีแท็กตรง (union) และไม่ opt-out', () => {
    const r = resolveAudience(base, { tags: ['vip'] }).map((x) => x.id);
    expect(r).toEqual(['a', 'c']); // e ถูกตัดเพราะ opt-out แม้เป็น vip
  });

  it('หลายแท็ก = intersection แบบ any-match', () => {
    const r = resolveAudience(base, { tags: ['ประจำ'] }).map((x) => x.id);
    expect(r).toEqual(['b', 'c']);
  });

  it('opt-out ถูกตัดเสมอแม้ตรง segment (PDPA #6)', () => {
    const r = resolveAudience([c('x', ['vip'], true)], { tags: ['vip'] });
    expect(r).toHaveLength(0);
  });

  it('tags ว่าง/ช่องว่างในเซกเมนต์ → ถือว่าไม่กรอง', () => {
    const r = resolveAudience(base, { tags: ['  '] }).map((x) => x.id);
    expect(r).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('dedupeKeyFor', () => {
  it('คงที่ต่อคู่ broadcast+customer', () => {
    expect(dedupeKeyFor('bc1', 'cust1')).toBe('bcast:bc1:cust1');
    expect(dedupeKeyFor('bc1', 'cust1')).toBe(dedupeKeyFor('bc1', 'cust1'));
    expect(dedupeKeyFor('bc1', 'cust2')).not.toBe(dedupeKeyFor('bc1', 'cust1'));
  });
});

describe('resolveAudience — PDPA ม.19 ต้องยินยอมก่อน', () => {
  it('ลูกค้าที่ยังไม่เคยยินยอม ไม่ถูกนับเป็นผู้รับ แม้ไม่ได้กดปฏิเสธ', () => {
    const got = resolveAudience([c('yes', []), cNoConsent('new')]);
    expect(got.map((x) => x.id)).toEqual(['yes']);
  });

  it('แท็กตรงแต่ยังไม่ยินยอม = ยังส่งไม่ได้ (เกณฑ์กลุ่มไม่ลบล้างความยินยอม)', () => {
    const got = resolveAudience([cNoConsent('new', ['VIP'])], { tags: ['VIP'] });
    expect(got).toHaveLength(0);
  });
});
