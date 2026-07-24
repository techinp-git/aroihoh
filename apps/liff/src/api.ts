// LIFF customer API client
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api';

const params = new URLSearchParams(location.search);
// brandId มาจาก URL (?brandId=) หรือ env — ใน LIFF จริงจะฝังมากับ config ของ LIFF app
export const BRAND_ID = params.get('brandId') || (import.meta.env.VITE_BRAND_ID as string) || '';

// deep link จาก Flex ใบยืนยัน (US-08) — `https://liff.line.me/<liffId>?orderId=...`
// LINE เอา query นี้ต่อท้าย Endpoint URL ที่มี ?brandId= อยู่แล้ว → มาถึงเราครบทั้งคู่
export const DEEP_LINK_ORDER_ID = params.get('orderId') || '';

let token = sessionStorage.getItem('liffToken') || '';
export const setToken = (t: string) => {
  token = t;
  sessionStorage.setItem('liffToken', t);
};

async function api<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.message?.reason || j.message || JSON.stringify(j);
    } catch {
      /* ignore */
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export interface MenuItem { id: string; name: string; description: string | null; price: number; imageUrl: string | null; }
export interface MenuCategory { id: string; name: string; items: MenuItem[]; }
export interface DeliveryCheck { inZone: boolean; distanceKm?: number; deliveryFee?: number; reason?: string; }
export interface OrderItemLite { id: string; nameSnapshot: string; qty: number; lineTotal: number; }
export interface OrderResult {
  id: string; status: string; paymentMethod: string; paymentStatus: string;
  subtotal: number; deliveryFee: number; total: number;
  items: OrderItemLite[]; createdAt: string; cancelReason: string | null;
}

export const devLogin = (name?: string) =>
  api<{ accessToken: string; customer: { id: string; displayName: string | null } }>(
    '/auth/dev-login',
    { method: 'POST', body: JSON.stringify({ brandId: BRAND_ID, name }) },
    false,
  );

export const lineLogin = (idToken: string) =>
  api<{ accessToken: string; customer: { id: string; displayName: string | null } }>(
    '/auth/line',
    { method: 'POST', body: JSON.stringify({ idToken, brandId: BRAND_ID }) },
    false,
  );

// US-39: ข้อมูลแบรนด์สำหรับธีม LIFF (ชื่อ/โลโก้/สีหลัก)
export interface BrandInfo { id: string; name: string; logoUrl: string | null; theme: { primaryColor?: string } | null; }
export const getBrand = () => api<BrandInfo>(`/brand/${BRAND_ID}`, {}, false);

export const getMenu = () => api<MenuCategory[]>(`/menu/${BRAND_ID}`, {}, false);

// จุดตั้งครัว + รัศมีส่ง — ให้แผนที่ตั้งกึ่งกลางและวาดวงเขต (US-03)
export interface DeliveryOrigin { name: string; lat: number; lng: number; maxDistanceKm: number }
export const getDeliveryOrigin = () => api<DeliveryOrigin>(`/delivery/origin/${BRAND_ID}`, {}, false);

export const checkDelivery = (lat: number, lng: number) =>
  api<DeliveryCheck>('/delivery/check', {
    method: 'POST',
    body: JSON.stringify({ brandId: BRAND_ID, lat, lng }),
  }, false);

export interface CreateOrderBody {
  idempotencyKey: string;
  items: { menuItemId: string; qty: number; note?: string }[];
  deliveryAddress: { detail: string; lat: number; lng: number; label?: string };
  paymentMethod: 'cod' | 'promptpay';
  note?: string;
}
export const createOrder = (body: CreateOrderBody) =>
  api<OrderResult>('/orders', { method: 'POST', body: JSON.stringify(body) });

export const getOrder = (id: string) => api<OrderResult>(`/orders/${id}`);

export const baht = (s: number) => (s / 100).toLocaleString('th-TH') + ' ฿';
