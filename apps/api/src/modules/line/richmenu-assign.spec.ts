import {
  chooseMenuForCustomer,
  planAssignments,
  groupChanges,
  chunk,
  type AssignableCustomer,
  type GroupMenu,
} from './richmenu-assign';
import type { AudienceRules } from '../audiences/rules';

const NOW = Date.UTC(2026, 8, 9);
const DAY = 86_400_000;

// ลูกค้าที่ยินยอมการตลาดแล้ว (ไม่งั้น matchesAudience ตัดออกเสมอ)
function cust(over: Partial<AssignableCustomer> = {}): AssignableCustomer {
  return {
    id: over.id ?? 'c1',
    lineUserId: over.lineUserId ?? 'U1',
    createdAt: over.createdAt ?? new Date(NOW - 400 * DAY),
    tags: over.tags ?? [],
    orders: over.orders ?? [],
    marketingOptedOut: over.marketingOptedOut ?? false,
    // ใช้ 'in' เพราะต้องแยก "ส่ง null มาเอง" ออกจาก "ไม่ส่ง" (?? จะกลืน null)
    marketingConsentAt: 'marketingConsentAt' in over ? over.marketingConsentAt : new Date(NOW - 300 * DAY),
    pointsBalance: over.pointsBalance ?? 0,
    assignedRichMenuId: over.assignedRichMenuId ?? null,
  };
}

const vipRules: AudienceRules = { match: 'all', criteria: [{ type: 'tags', tags: ['vip'] }] };
const pointsRules: AudienceRules = { match: 'all', criteria: [{ type: 'points_min', points: 100 }] };

const vipMenu: GroupMenu = { lineRichMenuId: 'rm-vip', rules: vipRules, priority: 10 };
const pointsMenu: GroupMenu = { lineRichMenuId: 'rm-points', rules: pointsRules, priority: 50 };

describe('chooseMenuForCustomer', () => {
  it('เลือกกลุ่มที่ priority สูงกว่า (เลขน้อยกว่า) เมื่อ match หลายกลุ่ม', () => {
    const c = cust({ tags: ['vip'], pointsBalance: 500 }); // เข้าทั้ง vip + points
    expect(chooseMenuForCustomer(c, [pointsMenu, vipMenu], NOW)).toBe('rm-vip');
  });

  it('ไม่เข้ากลุ่มไหน → null (ตกไป default)', () => {
    expect(chooseMenuForCustomer(cust({ tags: [], pointsBalance: 0 }), [vipMenu, pointsMenu], NOW)).toBeNull();
  });

  it('เข้ากลุ่มเดียว → เมนูกลุ่มนั้น', () => {
    expect(chooseMenuForCustomer(cust({ pointsBalance: 200 }), [vipMenu, pointsMenu], NOW)).toBe('rm-points');
  });

  it('คนที่ยังไม่ยินยอมการตลาด → ไม่เข้ากลุ่ม (ได้ default) แม้มีแท็กตรง', () => {
    const c = cust({ tags: ['vip'], marketingConsentAt: null });
    expect(chooseMenuForCustomer(c, [vipMenu], NOW)).toBeNull();
  });

  it('คนที่ถอนความยินยอม (opted out) → ไม่เข้ากลุ่ม', () => {
    const c = cust({ tags: ['vip'], marketingOptedOut: true });
    expect(chooseMenuForCustomer(c, [vipMenu], NOW)).toBeNull();
  });
});

describe('planAssignments — diff กับ assigned เดิม', () => {
  it('คืนเฉพาะรายที่ต้องเปลี่ยน', () => {
    const customers = [
      cust({ id: 'a', lineUserId: 'Ua', tags: ['vip'], assignedRichMenuId: 'rm-vip' }), // ถูกอยู่แล้ว
      cust({ id: 'b', lineUserId: 'Ub', tags: ['vip'], assignedRichMenuId: null }), // ต้อง link vip
      cust({ id: 'c', lineUserId: 'Uc', tags: [], assignedRichMenuId: 'rm-vip' }), // ต้อง unlink → default
    ];
    const { changes, unchanged } = planAssignments(customers, [vipMenu, pointsMenu], NOW);
    expect(unchanged).toBe(1);
    expect(changes).toEqual([
      { customerId: 'b', lineUserId: 'Ub', from: null, to: 'rm-vip' },
      { customerId: 'c', lineUserId: 'Uc', from: 'rm-vip', to: null },
    ]);
  });
});

describe('groupChanges', () => {
  it('จับ link เป็นกลุ่มตามเมนูปลายทาง + แยก unlink', () => {
    const { link, unlinkUserIds } = groupChanges([
      { customerId: 'b', lineUserId: 'Ub', from: null, to: 'rm-vip' },
      { customerId: 'd', lineUserId: 'Ud', from: null, to: 'rm-vip' },
      { customerId: 'e', lineUserId: 'Ue', from: null, to: 'rm-points' },
      { customerId: 'c', lineUserId: 'Uc', from: 'rm-vip', to: null },
    ]);
    expect(unlinkUserIds).toEqual(['Uc']);
    expect(link).toContainEqual({ lineRichMenuId: 'rm-vip', userIds: ['Ub', 'Ud'] });
    expect(link).toContainEqual({ lineRichMenuId: 'rm-points', userIds: ['Ue'] });
  });
});

describe('chunk', () => {
  it('แบ่งก้อนละ 500 (ลิมิต bulk link ของ LINE)', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `U${i}`);
    const parts = chunk(ids, 500);
    expect(parts.map((p) => p.length)).toEqual([500, 500, 200]);
  });
});
