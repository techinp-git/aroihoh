/**
 * US-61: โหมดพนักงานใน LIFF — client ของ admin API (คนละ token กับฝั่งลูกค้า)
 *
 * ลูกค้าใช้ customer JWT ส่วนการยืนยันคูปองแลกแต้มต้องใช้ admin JWT (คนละ secret)
 * ทั้งสองอันจึงอยู่ในเว็บเดียวกันแต่แยกกัน: `liffToken` (ลูกค้า) / `liffStaffToken` (พนักงาน)
 *
 * เก็บ admin token ไว้ใน sessionStorage ไม่ใช่ localStorage — LIFF เปิดใหม่ทุกครั้งอยู่แล้ว
 * และเข้าใหม่ได้เองด้วยบัญชี LINE ที่ผูกไว้ ไม่ต้องแช่ token ค้างบนมือถือที่วางไว้หน้าร้าน
 */
import { API_BASE, BRAND_ID } from './api';

export type StaffRole = 'owner' | 'manager' | 'staff' | 'kitchen' | 'chat_agent';

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  brandIds: string[];
}

export interface StaffSession {
  token: string;
  admin: StaffProfile;
  brandId: string;
  /** server เป็นคนตอบว่าเห็นหน้าสแกนไหม — LIFF ไม่คิดกฎ role เอง */
  canScanRedemptions: boolean;
  /** ผูกบัญชี LINE นี้ไว้แล้วหรือยัง (ครั้งหน้าเปิด LIFF จะเข้าเองไม่ต้องพิมพ์รหัสผ่าน) */
  linked?: boolean;
}

const KEY = 'liffStaffToken';
let staffToken = sessionStorage.getItem(KEY) || '';

export const getStaffToken = () => staffToken;
export function setStaffToken(t: string) {
  staffToken = t;
  sessionStorage.setItem(KEY, t);
}
export function clearStaffToken() {
  staffToken = '';
  sessionStorage.removeItem(KEY);
}

async function adminApi<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && staffToken ? { Authorization: `Bearer ${staffToken}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.message?.message || j.message || '';
    } catch {
      /* ไม่มี body ก็ใช้เลขสถานะ */
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

/** เข้าโหมดพนักงานด้วยบัญชี LINE ที่ผูกไว้ — ลูกค้าทั่วไปจะได้ 404 (ไม่ใช่ error ที่ต้องโชว์) */
export const staffLineLogin = (idToken: string) =>
  adminApi<StaffSession>(
    '/admin/auth/line',
    { method: 'POST', body: JSON.stringify({ idToken, brandId: BRAND_ID }) },
    false,
  );

/** ล็อกอินอีเมล/รหัสผ่าน แล้วผูกบัญชี LINE ที่ถืออยู่เข้ากับบัญชีนั้นในคำสั่งเดียว */
export async function staffPasswordLogin(
  email: string,
  password: string,
  idToken?: string,
): Promise<StaffSession> {
  const r = await adminApi<{ token: string; admin: StaffProfile }>(
    '/admin/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  );
  setStaffToken(r.token);
  try {
    // ผูก LINE ให้เลย (ถ้ามี ID token) — ครั้งหน้าเปิด LIFF เข้าได้เองไม่ต้องพิมพ์รหัสผ่าน
    return await adminApi<StaffSession>('/admin/auth/line/link', {
      method: 'POST',
      body: JSON.stringify({ brandId: BRAND_ID, ...(idToken ? { idToken } : {}) }),
    });
  } catch (e) {
    clearStaffToken(); // ล็อกอินผ่านแต่ไม่มีสิทธิ์ในร้านนี้ = อย่าค้าง token ไว้
    throw e;
  }
}

/** เลิกผูกบัญชี LINE นี้กับร้านนี้ (มือถือหาย/เปลี่ยนคนขาย) */
export const staffUnlink = () =>
  adminApi<{ unlinked: number }>('/admin/auth/line/unlink', {
    method: 'POST',
    body: JSON.stringify({ brandId: BRAND_ID }),
  });

// ── คูปองแลกแต้ม (US-54 ฉบับอยู่ใน LINE) ──
// ไม่ต้องส่ง brandId — server อ่านจากตัวคูปองแล้วเช็คสิทธิ์เอง (กันข้ามแบรนด์)
export interface RedemptionPreview {
  id: string;
  brandId: string;
  customerName: string | null;
  balance: number;
  rewardName: string;
  pointsCost: number;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  expiresAt: string;
  confirmable: boolean;
}

export const previewRedemption = (token: string) =>
  adminApi<RedemptionPreview>(`/admin/loyalty/redemptions/${encodeURIComponent(token)}`);

export const confirmRedemption = (token: string) =>
  adminApi<{ confirmed: boolean; rewardName: string; pointsSpent: number; balance: number }>(
    `/admin/loyalty/redemptions/${encodeURIComponent(token)}/confirm`,
    { method: 'POST' },
  );
