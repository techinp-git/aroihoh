// LIFF customer API client
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3000/api';

const params = new URLSearchParams(location.search);
// brandId มาจาก URL (?brandId=) หรือ env — ใน LIFF จริงจะฝังมากับ config ของ LIFF app
export const BRAND_ID = params.get('brandId') || (import.meta.env.VITE_BRAND_ID as string) || '';

// deep link จาก Flex ใบยืนยัน (US-08) — `https://liff.line.me/<liffId>?orderId=...`
// LINE เอา query นี้ต่อท้าย Endpoint URL ที่มี ?brandId= อยู่แล้ว → มาถึงเราครบทั้งคู่
export const DEEP_LINK_ORDER_ID = params.get('orderId') || '';

// US-59: Rich Menu / ลิงก์ยิงตรงเข้าแท็บ — `?view=profile` | `?view=points`
export const DEEP_LINK_VIEW = params.get('view') || '';

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
  // US-58: ส่งอย่างใดอย่างหนึ่ง — หมุดในสมุด หรือหมุดที่ปักสด
  savedAddressId?: string;
  deliveryAddress?: { detail: string; lat: number; lng: number; label?: string; note?: string };
  /** ติ๊ก "บันทึกที่อยู่นี้ไว้" (ใช้กับ deliveryAddress เท่านั้น) */
  saveAddress?: boolean;
  paymentMethod: 'cod' | 'promptpay';
  note?: string;
}
export const createOrder = (body: CreateOrderBody) =>
  api<OrderResult>('/orders', { method: 'POST', body: JSON.stringify(body) });

export const getOrder = (id: string) => api<OrderResult>(`/orders/${id}`);

// ── US-58/59: โปรไฟล์ + สมุดที่อยู่ ──
export interface SavedAddress {
  id: string;
  label: string | null;
  detail: string;
  note: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
  updatedAt: string;
  /** ส่งถึงไหม — server คำนวณสด (null = ยังไม่รู้ เช่นแบรนด์ยังไม่ผูกครัว) */
  deliverable: boolean | null;
  distanceKm: number | null;
  deliveryFee: number | null;
}
/** EP-14 ยังไม่ลง → /me/profile คืน loyalty เป็น null และแท็บ "แต้ม" จะยังไม่โผล่ */
export interface LoyaltySummary {
  balance: number;
  nextReward?: { name: string; pointsCost: number } | null;
}
export interface RecentOrder {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  items: { nameSnapshot: string; qty: number }[];
}
export interface Profile {
  displayName: string | null;
  pictureUrl: string | null;
  memberSince: string;
  hasPhone: boolean;
  phoneLast4: string | null;
  marketingOptedOut: boolean;
  addresses: SavedAddress[];
  addressLimit: number;
  recentOrders: RecentOrder[];
  loyalty: LoyaltySummary | null;
}
export interface AddressBook {
  addresses: SavedAddress[];
}
export interface AddressInput {
  label?: string;
  detail: string;
  note?: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export const getProfile = () => api<Profile>('/me/profile');

/** US-60: เบอร์โทร (เก็บแบบเข้ารหัส) + เลือกรับ/ไม่รับข่าวสารเอง — ส่ง phone:'' เพื่อลบเบอร์ */
export const updateProfile = (body: { phone?: string | null; marketingOptedOut?: boolean }) =>
  api<Profile>('/me/profile', { method: 'PATCH', body: JSON.stringify(body) });

export const createAddress = (body: AddressInput) =>
  api<AddressBook & { created: string }>('/me/addresses', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateAddress = (id: string, body: Partial<AddressInput>) =>
  api<AddressBook>(`/me/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteAddress = (id: string) =>
  api<AddressBook>(`/me/addresses/${id}`, { method: 'DELETE' });

export const baht = (s: number) => (s / 100).toLocaleString('th-TH') + ' ฿';
