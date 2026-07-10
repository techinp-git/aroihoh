import { ORDER_STATUS_FLOW } from '@aroihoh/shared';

// API client ฝั่งแอดมิน — ใช้ admin JWT (US-29) แทน x-admin-key
export const API_BASE =
  localStorage.getItem('apiBase') || 'http://localhost:3000/api';

export const getAdminToken = () => localStorage.getItem('adminToken') || '';

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  brandIds: string[];
}

export const setAuth = (token: string, admin: AdminProfile) => {
  localStorage.setItem('adminToken', token);
  localStorage.setItem('adminProfile', JSON.stringify(admin));
};
export const clearAuth = () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminProfile');
};
export const getAdminProfile = (): AdminProfile | null => {
  try {
    return JSON.parse(localStorage.getItem('adminProfile') || 'null');
  } catch {
    return null;
  }
};

export async function adminFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAdminToken()}`,
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

// ── Auth (US-29) ──
export async function login(email: string, password: string) {
  const res = await fetch(API_BASE + '/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || 'เข้าสู่ระบบไม่สำเร็จ');
  }
  return res.json() as Promise<{ token: string; admin: AdminProfile }>;
}

// ── Types ──
export interface Brand { id: string; name: string; slug: string; isActive: boolean; codEnabled?: boolean; }
export interface OrderItem { id: string; nameSnapshot: string; unitPrice: number; qty: number; lineTotal: number; }
export interface Order {
  id: string; status: string; paymentMethod: string; paymentStatus: string;
  subtotal: number; deliveryFee: number; total: number;
  note: string | null; cancelReason: string | null; createdAt: string; items: OrderItem[];
}
export interface DailyReport {
  date: string; count: number; completed: number; cancelled: number;
  revenue: number; avgOrderValue: number; byStatus: Record<string, number>;
}
export interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  imageUrl: string | null; isAvailable: boolean; categoryId: string | null;
}
export interface AdminUser {
  id: string; email: string; name: string; role: string; isActive: boolean; brandIds: string[];
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

export const dailyReport = (brandId: string, date?: string) =>
  adminFetch<DailyReport>(
    `/admin/reports/daily?brandId=${encodeURIComponent(brandId)}` + (date ? `&date=${date}` : ''),
  );

export const markPaid = (brandId: string, orderId: string) =>
  adminFetch<{ paymentStatus: string; alreadyPaid: boolean }>(
    `/admin/orders/${orderId}/mark-paid?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH' },
  );

export const setBrandCod = (brandId: string, enabled: boolean) =>
  adminFetch<{ id: string; codEnabled: boolean }>(
    `/admin/brands/${brandId}/cod`,
    { method: 'PATCH', body: JSON.stringify({ enabled }) },
  );

export interface CustomerRow {
  id: string; displayName: string | null; pictureUrl: string | null; lineUserId: string;
  tags: string[]; createdAt: string; orderCount: number; totalSpent: number; lastOrderAt: string | null;
}
export interface CustomerDetail extends CustomerRow {
  addresses: { id: string; label: string | null; detail: string; lat: number; lng: number }[];
  orders: Order[];
}

export const listCustomers = (brandId: string, q?: string) =>
  adminFetch<CustomerRow[]>(
    `/admin/customers?brandId=${encodeURIComponent(brandId)}` + (q ? `&q=${encodeURIComponent(q)}` : ''),
  );

export const getCustomer = (brandId: string, id: string) =>
  adminFetch<CustomerDetail>(`/admin/customers/${id}?brandId=${encodeURIComponent(brandId)}`);

export const updateCustomerTags = (brandId: string, id: string, tags: string[]) =>
  adminFetch<{ id: string; tags: string[] }>(
    `/admin/customers/${id}/tags?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ tags }) },
  );

export interface ChatConversation {
  customerId: string; displayName: string | null; lastMessage: string;
  lastAt: string | null; lastDirection: string | null; unread: number;
}
export interface ChatMsg {
  id: string; direction: 'inbound' | 'outbound'; text: string; adminId: string | null; createdAt: string;
}
export interface ChatThread {
  customer: { id: string; displayName: string | null; lineUserId: string };
  messages: ChatMsg[];
}

export const listConversations = (brandId: string) =>
  adminFetch<ChatConversation[]>(`/admin/chat/conversations?brandId=${encodeURIComponent(brandId)}`);
export const getThread = (brandId: string, customerId: string) =>
  adminFetch<ChatThread>(`/admin/chat/${customerId}?brandId=${encodeURIComponent(brandId)}`);
export const sendChat = (brandId: string, customerId: string, text: string) =>
  adminFetch<ChatMsg>(`/admin/chat/${customerId}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

export const listAdminUsers = () => adminFetch<AdminUser[]>('/admin/users');
export const createAdminUser = (body: {
  email: string; password: string; name: string; role: string; brandIds?: string[];
}) => adminFetch<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(body) });
export const updateAdminUser = (
  id: string,
  body: { role?: string; isActive?: boolean; name?: string; brandIds?: string[] },
) => adminFetch<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

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
export const ROLE_TH: Record<string, string> = {
  owner: 'เจ้าของ',
  manager: 'ผู้จัดการ',
  staff: 'พนักงาน',
};

export const ALL_STATUSES = [...ORDER_STATUS_FLOW, 'cancelled'];
export const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'delivering']);

export function nextStatus(s: string): string | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(s);
  return i >= 0 && i < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[i + 1] : null;
}
