import { ORDER_STATUS_FLOW } from '@aroihoh/shared';

// API client ฝั่งแอดมิน — แนบ x-admin-key (ชั่วคราว รอ admin auth จริง US-29)
export const API_BASE =
  localStorage.getItem('apiBase') || 'http://localhost:3000/api';

export const getAdminKey = () => localStorage.getItem('adminKey') || '';
export const setAdminKey = (k: string) => localStorage.setItem('adminKey', k);
export const clearAdminKey = () => localStorage.removeItem('adminKey');

export async function adminFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getAdminKey(),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status} ${detail}`);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

// ── Types ──
export interface Brand { id: string; name: string; slug: string; isActive: boolean; }
export interface OrderItem { id: string; nameSnapshot: string; unitPrice: number; qty: number; lineTotal: number; }
export interface Order {
  id: string; status: string; paymentMethod: string; paymentStatus: string;
  subtotal: number; deliveryFee: number; total: number;
  note: string | null; cancelReason: string | null; createdAt: string; items: OrderItem[];
}
export interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  imageUrl: string | null; isAvailable: boolean; categoryId: string | null;
}

// ── Endpoints ──
export const listBrands = () => adminFetch<Brand[]>('/admin/brands');

export const listOrders = (brandId: string, status?: string) =>
  adminFetch<Order[]>(
    `/admin/orders?brandId=${encodeURIComponent(brandId)}` + (status ? `&status=${status}` : ''),
  );

export const changeStatus = (brandId: string, orderId: string, status: string, reason?: string) =>
  adminFetch<Order>(`/admin/orders/${orderId}/status?brandId=${encodeURIComponent(brandId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });

export const listMenu = (brandId: string) =>
  adminFetch<MenuItem[]>(`/admin/menu?brandId=${encodeURIComponent(brandId)}`);

export const setItemAvailability = (brandId: string, id: string, isAvailable: boolean) =>
  adminFetch<MenuItem>(
    `/admin/menu/items/${id}/availability?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ isAvailable }) },
  );

export const updateItemPrice = (brandId: string, id: string, price: number) =>
  adminFetch<MenuItem>(`/admin/menu/items/${id}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ price }),
  });

// ── Shared UI helpers ──
export const baht = (satang: number) =>
  (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 0 }) + ' ฿';

export const STATUS_TH: Record<string, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'รับออเดอร์',
  preparing: 'กำลังทำ',
  delivering: 'ออกส่ง',
  completed: 'ส่งสำเร็จ',
  cancelled: 'ยกเลิก',
};

export const ALL_STATUSES = [...ORDER_STATUS_FLOW, 'cancelled'];
export const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'delivering']);

export function nextStatus(s: string): string | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(s);
  return i >= 0 && i < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[i + 1] : null;
}
