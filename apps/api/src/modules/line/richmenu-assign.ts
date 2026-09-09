/**
 * จับคู่ลูกค้า → Rich Menu ตามกลุ่ม (audience) — pure, unit-testable
 *
 * กติกา: เมนูกลุ่มเรียงตาม priority (เลขน้อย = สำคัญกว่า/เช็คก่อน) ลูกค้าเข้ากลุ่มแรกที่ match
 * ไม่เข้ากลุ่มไหนเลย → default menu (LINE default ครอบให้เอง ไม่ต้อง link รายคน)
 *
 * reuse matchesAudience จาก audiences/rules.ts → ได้ตรรกะ + การกันคนที่ยินยอมการตลาดไม่ได้ (PDPA) ฟรี
 * ผลข้างเคียง: คนที่ยังไม่ยินยอมการตลาด จะไม่เข้ากลุ่มไหน → ได้ default (ตั้งใจให้ปลอดภัยไว้ก่อน)
 */
import { matchesAudience, type AudienceRules, type AudienceCustomer } from '../audiences/rules';

export interface AssignableCustomer extends AudienceCustomer {
  lineUserId: string;
  /** เมนูที่ผูกให้ล่าสุด (เก็บเป็น lineRichMenuId) — null/undefined = อยู่ default */
  assignedRichMenuId?: string | null;
}

export interface GroupMenu {
  /** id ที่ LINE ออกให้ — ต้อง published แล้วเท่านั้นถึงจะเอามา link ได้ */
  lineRichMenuId: string;
  rules: AudienceRules;
  priority: number;
}

/** เลือก lineRichMenuId ของกลุ่มที่ลูกค้าเข้า (ตาม priority) — คืน null ถ้าไม่เข้ากลุ่มไหน (= default) */
export function chooseMenuForCustomer(
  cust: AssignableCustomer,
  menus: GroupMenu[],
  nowMs: number,
): string | null {
  const sorted = [...menus].sort((a, b) => a.priority - b.priority);
  for (const m of sorted) {
    if (matchesAudience(cust, m.rules, nowMs)) return m.lineRichMenuId;
  }
  return null;
}

export interface AssignChange {
  customerId: string;
  lineUserId: string;
  from: string | null; // เมนูปัจจุบัน (null = default)
  to: string | null; // เมนูที่ควรเป็น (null = default)
}

/**
 * วางแผนการเปลี่ยนเมนู — คืนเฉพาะรายที่ต้องเปลี่ยนจริง (diff กับ assignedRichMenuId เดิม)
 * เพื่อไม่ต้อง link/unlink ทุกคนทุกครั้ง sync (ประหยัดโควตา LINE + เร็ว)
 */
export function planAssignments(
  customers: AssignableCustomer[],
  menus: GroupMenu[],
  nowMs: number,
): { changes: AssignChange[]; unchanged: number } {
  const changes: AssignChange[] = [];
  let unchanged = 0;
  for (const c of customers) {
    const to = chooseMenuForCustomer(c, menus, nowMs);
    const from = c.assignedRichMenuId ?? null;
    if (from === to) {
      unchanged++;
      continue;
    }
    changes.push({ customerId: c.id, lineUserId: c.lineUserId, from, to });
  }
  return { changes, unchanged };
}

/** จัด changes เป็นชุด link (จับกลุ่มตาม lineRichMenuId ปลายทาง) + unlink (กลับไป default) */
export function groupChanges(changes: AssignChange[]): {
  link: { lineRichMenuId: string; userIds: string[] }[];
  unlinkUserIds: string[];
} {
  const byMenu = new Map<string, string[]>();
  const unlinkUserIds: string[] = [];
  for (const ch of changes) {
    if (ch.to === null) {
      unlinkUserIds.push(ch.lineUserId);
    } else {
      const arr = byMenu.get(ch.to) ?? [];
      arr.push(ch.lineUserId);
      byMenu.set(ch.to, arr);
    }
  }
  return {
    link: [...byMenu.entries()].map(([lineRichMenuId, userIds]) => ({ lineRichMenuId, userIds })),
    unlinkUserIds,
  };
}

/** แบ่ง array เป็นก้อนละ size (LINE bulk link/unlink รับสูงสุด 500 userId ต่อคำขอ) */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
