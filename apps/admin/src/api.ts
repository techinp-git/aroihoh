// API client ฝั่งแอดมิน — แนบ x-admin-key (ชั่วคราว รอ admin auth จริง)
export const API_BASE =
  localStorage.getItem('apiBase') || 'http://localhost:3000/api';

export const getAdminKey = () => localStorage.getItem('adminKey') || '';
export const setAdminKey = (k: string) => localStorage.setItem('adminKey', k);

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

export interface Brand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  nameSnapshot: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  items: OrderItem[];
}

export const listBrands = () => adminFetch<Brand[]>('/admin/brands');

export const listOrders = (brandId: string, status?: string) =>
  adminFetch<Order[]>(
    `/admin/orders?brandId=${encodeURIComponent(brandId)}` +
      (status ? `&status=${status}` : ''),
  );

export const changeStatus = (
  brandId: string,
  orderId: string,
  status: string,
  reason?: string,
) =>
  adminFetch<Order>(
    `/admin/orders/${orderId}/status?brandId=${encodeURIComponent(brandId)}`,
    { method: 'PATCH', body: JSON.stringify({ status, reason }) },
  );

/** สตางค์ → บาท */
export const baht = (satang: number) =>
  (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 0 }) + ' ฿';
