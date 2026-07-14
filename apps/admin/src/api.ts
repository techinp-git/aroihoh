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
export interface Brand {
  id: string; name: string; slug: string; isActive: boolean; codEnabled?: boolean;
  logoUrl?: string | null; brandKitchens?: { kitchenId: string }[];
}
export interface Kitchen { id: string; name: string; isOpen: boolean; }
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
export interface MenuCategory {
  id: string; name: string; sortOrder: number; isActive: boolean;
}
export interface AdminUser {
  id: string; email: string; name: string; role: string; isActive: boolean; brandIds: string[];
}

// ── Endpoints ──
export const listBrands = () => adminFetch<Brand[]>('/admin/brands');

// US-36: จัดการแบรนด์ (owner)
export const listKitchens = () => adminFetch<Kitchen[]>('/admin/kitchens');

export async function createBrand(input: {
  name: string; slug: string; logoUrl?: string; kitchenIds: string[];
}) {
  const res = await adminFetch<{ brand: Brand; token: string; admin: AdminProfile }>(
    '/admin/brands',
    { method: 'POST', body: JSON.stringify(input) },
  );
  // refresh token: brandIds เปลี่ยน (มีแบรนด์ใหม่) → เก็บ token ใหม่ ไม่งั้นเข้าถึงแบรนด์ใหม่ไม่ได้ (403)
  setAuth(res.token, res.admin);
  return res.brand;
}

export const updateBrand = (
  id: string,
  input: { name?: string; logoUrl?: string; isActive?: boolean; kitchenIds?: string[] },
) => adminFetch<Brand>(`/admin/brands/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export const listOrders = (brandId: string, status?: string) =>
  adminFetch<Order[]>(
    `/admin/orders?brandId=${encodeURIComponent(brandId)}` + (status ? `&status=${status}` : ''),
  );

export const changeStatus = (brandId: string, orderId: string, status: string, reason?: string) =>
  adminFetch<Order>(`/admin/orders/${orderId}/status?brandId=${encodeURIComponent(brandId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });

// US-37: จอครัว (KDS) — ออเดอร์ active รวมทุกแบรนด์ที่ admin มีสิทธิ์ (ติด brandId/brandName)
export interface KitchenOrder extends Order {
  brandId: string;
  brand: { name: string };
}
export const listKitchenOrders = () => adminFetch<KitchenOrder[]>('/admin/kitchen/orders');
export const kitchenStreamUrl = () =>
  `${API_BASE}/admin/kitchen/stream?token=${encodeURIComponent(getAdminToken())}`;

export const listMenu = (brandId: string) =>
  adminFetch<MenuItem[]>(`/admin/menu?brandId=${encodeURIComponent(brandId)}`);

export const setItemAvailability = (brandId: string, id: string, isAvailable: boolean) =>
  adminFetch<MenuItem>(
    `/admin/menu/items/${id}/availability?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ isAvailable }) },
  );

export const updateItemPrice = (brandId: string, id: string, price: number) =>
  updateMenuItem(brandId, id, { price });

export const listMenuCategories = (brandId: string) =>
  adminFetch<MenuCategory[]>(`/admin/menu/categories?brandId=${encodeURIComponent(brandId)}`);

export const createMenuCategory = (brandId: string, name: string, sortOrder?: number) =>
  adminFetch<MenuCategory>('/admin/menu/categories', {
    method: 'POST',
    body: JSON.stringify({ brandId, name, sortOrder }),
  });

export interface MenuItemInput {
  name?: string; description?: string | null; price?: number;
  imageUrl?: string | null; categoryId?: string | null;
}

export const createMenuItem = (
  brandId: string,
  body: { name: string; price: number; description?: string; imageUrl?: string; categoryId?: string },
) => adminFetch<MenuItem>('/admin/menu/items', {
  method: 'POST',
  body: JSON.stringify({ brandId, ...body }),
});

export const updateMenuItem = (brandId: string, id: string, body: MenuItemInput) =>
  adminFetch<MenuItem>(`/admin/menu/items/${id}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteMenuItem = (brandId: string, id: string) =>
  adminFetch<{ deleted: boolean }>(`/admin/menu/items/${id}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'DELETE',
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

export interface StoreState {
  kitchenId: string; name: string; isOpen: boolean;
  openTime: string | null; closeTime: string | null;
  acceptingNow: boolean; reason: string | null;
}
export const getStore = (brandId: string) =>
  adminFetch<StoreState>(`/admin/store?brandId=${encodeURIComponent(brandId)}`);
export const setStorePause = (brandId: string, isOpen: boolean) =>
  adminFetch<StoreState>(`/admin/store/pause?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ isOpen }) });
export const setStoreHours = (brandId: string, openTime: string | null, closeTime: string | null) =>
  adminFetch<StoreState>(`/admin/store/hours?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ openTime, closeTime }) });

export interface CustomerRow {
  id: string; displayName: string | null; pictureUrl: string | null; lineUserId: string;
  tags: string[]; marketingOptedOut?: boolean; createdAt: string;
  orderCount: number; totalSpent: number; lastOrderAt: string | null;
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
  customerId: string; brandId: string; brandName: string; displayName: string | null;
  lastMessage: string; lastAt: string | null; lastDirection: string | null; unread: number;
}
export interface ChatMsg {
  id: string; direction: 'inbound' | 'outbound'; text: string; adminId: string | null; createdAt: string;
}
export interface ChatThread {
  customer: {
    id: string; displayName: string | null; lineUserId: string;
    brandId: string; brand: { name: string };
  };
  messages: ChatMsg[];
}

// US-40: ไม่ส่ง brandId = inbox รวมทุกแบรนด์ที่ admin มีสิทธิ์
export const listConversations = (brandId?: string) =>
  adminFetch<ChatConversation[]>(
    '/admin/chat/conversations' + (brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''),
  );
export const getThread = (brandId: string, customerId: string) =>
  adminFetch<ChatThread>(`/admin/chat/${customerId}?brandId=${encodeURIComponent(brandId)}`);
export const sendChat = (brandId: string, customerId: string, text: string) =>
  adminFetch<ChatMsg>(`/admin/chat/${customerId}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

// ── Broadcast (US-18) ──
export interface Broadcast {
  id: string; message: string; segment: { tags?: string[] } | null;
  contentId: string | null; audienceId: string | null;
  content?: { title: string } | null; audience?: { name: string } | null;
  status: string; audienceCount: number; sentCount: number; failedCount: number;
  createdBy: string | null; createdAt: string;
}
export interface BroadcastPreview { totalCustomers: number; optedOut: number; audienceCount: number; }

export const previewBroadcast = (brandId: string, opts: { segment?: { tags?: string[] }; audienceId?: string }) =>
  adminFetch<BroadcastPreview>(`/admin/broadcasts/preview?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
export const createBroadcast = (
  brandId: string,
  body: { message?: string; contentId?: string; segment?: { tags?: string[] }; audienceId?: string },
) =>
  adminFetch<Broadcast>(`/admin/broadcasts?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const listBroadcasts = (brandId: string) =>
  adminFetch<Broadcast[]>(`/admin/broadcasts?brandId=${encodeURIComponent(brandId)}`);
export const dispatchBroadcast = (brandId: string, id: string) =>
  adminFetch<{ dispatched: number; skipped?: boolean; failed?: number }>(
    `/admin/broadcasts/${id}/dispatch?brandId=${encodeURIComponent(brandId)}`, { method: 'POST' });

// ── Content Library (US-18) ──
export interface Content { id: string; title: string; body: string; createdAt: string; updatedAt: string; }
export const listContent = (brandId: string) =>
  adminFetch<Content[]>(`/admin/content?brandId=${encodeURIComponent(brandId)}`);
export const createContent = (brandId: string, title: string, body: string) =>
  adminFetch<Content>(`/admin/content?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST', body: JSON.stringify({ title, body }),
  });
export const updateContent = (brandId: string, id: string, body: { title?: string; body?: string }) =>
  adminFetch<Content>(`/admin/content/${id}?brandId=${encodeURIComponent(brandId)}`, {
    method: 'PATCH', body: JSON.stringify(body),
  });
export const deleteContent = (brandId: string, id: string) =>
  adminFetch<{ deleted: boolean }>(`/admin/content/${id}?brandId=${encodeURIComponent(brandId)}`, { method: 'DELETE' });

// ── Audiences (US-18) — กลุ่มเป้าหมายที่บันทึกไว้ (rules ประเมินสด) ──
export type Criterion =
  | { type: 'tenure_min_days'; days: number }
  | { type: 'order_count_in_window'; windowDays: number; minCount: number }
  | { type: 'lapsed'; inactiveDays: number; lookbackDays: number }
  | { type: 'tags'; tags: string[] };
export interface AudienceRules { match: 'all' | 'any'; criteria: Criterion[]; }
export interface Audience {
  id: string; name: string; description: string | null; rules: AudienceRules;
  createdAt: string; updatedAt: string;
}
export interface AudiencePreset { key: string; name: string; rules: AudienceRules; }

export const listAudiences = (brandId: string) =>
  adminFetch<Audience[]>(`/admin/audiences?brandId=${encodeURIComponent(brandId)}`);
export const audiencePresets = () => adminFetch<AudiencePreset[]>('/admin/audiences/presets');
export const previewAudienceRules = (brandId: string, rules: AudienceRules) =>
  adminFetch<BroadcastPreview>(`/admin/audiences/preview?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST', body: JSON.stringify({ rules }),
  });
export const createAudience = (brandId: string, body: { name: string; description?: string; rules: AudienceRules }) =>
  adminFetch<Audience>(`/admin/audiences?brandId=${encodeURIComponent(brandId)}`, {
    method: 'POST', body: JSON.stringify(body),
  });
export const deleteAudience = (brandId: string, id: string) =>
  adminFetch<{ deleted: boolean }>(`/admin/audiences/${id}?brandId=${encodeURIComponent(brandId)}`, { method: 'DELETE' });

export const setCustomerOptOut = (brandId: string, id: string, optedOut: boolean) =>
  adminFetch<{ id: string; marketingOptedOut: boolean }>(
    `/admin/customers/${id}/opt-out?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ optedOut }) },
  );

// ── LINE config (US-25 / SETUP-1) — owner only, ไม่คืน secret/token ดิบ ──
export interface LineConfig {
  channelId: string; liffId: string;
  hasChannelSecret: boolean; hasAccessToken: boolean;
  configured: boolean; webhookUrl: string;
}
export const getLineConfig = (brandId: string) =>
  adminFetch<LineConfig>(`/admin/line-config?brandId=${encodeURIComponent(brandId)}`);
export const updateLineConfig = (
  brandId: string,
  body: { channelId?: string; liffId?: string; channelSecret?: string; channelAccessToken?: string },
) => adminFetch<LineConfig>(`/admin/line-config?brandId=${encodeURIComponent(brandId)}`, {
  method: 'PUT', body: JSON.stringify(body),
});
export const testLineConfig = (brandId: string) =>
  adminFetch<{ ok: boolean; name?: string; userId?: string; error?: string }>(
    `/admin/line-config/test?brandId=${encodeURIComponent(brandId)}`, { method: 'POST' });
export const getLineUsage = (brandId: string) =>
  adminFetch<{ reply: number; push: number; total: number; savedByReply: number }>(
    `/admin/line-config/usage?brandId=${encodeURIComponent(brandId)}`);

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
  ready: 'จัดเสร็จ รอไรเดอร์',
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
export const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'delivering']);

export function nextStatus(s: string): string | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(s);
  return i >= 0 && i < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[i + 1] : null;
}
