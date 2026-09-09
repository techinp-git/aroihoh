import { useEffect, useState, useCallback } from 'react';
import {
  getAdminToken,
  getAdminProfile,
  setAuth,
  login as apiLogin,
  listBrands,
  type Brand,
  type AdminProfile,
} from './api';
import Dashboard from './views/Dashboard';
import Orders from './views/Orders';
import Kitchen from './views/Kitchen';
import Menu from './views/Menu';
import Customers from './views/Customers';
import Chat from './views/Chat';
import Broadcast from './views/Broadcast';
import Users from './views/Users';
import Settings from './views/Settings';
import Loyalty from './views/Loyalty';
import RichMenu from './views/RichMenu';

type View = 'dashboard' | 'orders' | 'kitchen' | 'menu' | 'chat' | 'broadcast' | 'customers' | 'loyalty' | 'richmenu' | 'users' | 'settings';

// US-45: แต่ละเมนูโชว์เฉพาะ role ที่ระบุ (kitchen เห็นแค่ KDS, chat_agent เห็นแค่แชต)
type Role = 'owner' | 'manager' | 'staff' | 'kitchen' | 'chat_agent';
const NAV: { key: View; label: string; ic: string; roles: Role[] }[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', ic: '🏠', roles: ['owner', 'manager', 'staff'] },
  { key: 'orders', label: 'ออเดอร์', ic: '🧾', roles: ['owner', 'manager', 'staff'] },
  { key: 'kitchen', label: 'ครัว (KDS)', ic: '🍳', roles: ['owner', 'manager', 'staff', 'kitchen'] },
  { key: 'chat', label: 'แชต', ic: '💬', roles: ['owner', 'manager', 'staff', 'chat_agent'] },
  { key: 'broadcast', label: 'ส่งข่าวสาร', ic: '📣', roles: ['owner', 'manager'] },
  { key: 'menu', label: 'เมนู', ic: '🍜', roles: ['owner', 'manager', 'staff'] },
  { key: 'customers', label: 'ลูกค้า', ic: '👤', roles: ['owner', 'manager', 'staff'] },
  // US-54: คนขาย (staff) ต้องกดยืนยันแลกแต้มเองได้ ไม่ต้องตาม manager
  { key: 'loyalty', label: 'สะสมแต้ม', ic: '🎯', roles: ['owner', 'manager', 'staff'] },
  { key: 'richmenu', label: 'Rich Menu', ic: '📱', roles: ['owner'] },
  { key: 'users', label: 'ผู้ใช้ & สิทธิ์', ic: '👥', roles: ['owner'] },
  { key: 'settings', label: 'ตั้งค่า', ic: '⚙️', roles: ['owner', 'manager'] },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  dashboard: { title: 'แดชบอร์ด', sub: 'ภาพรวมออเดอร์และยอดขาย' },
  orders: { title: 'จัดการออเดอร์', sub: 'ไล่สถานะ / ยกเลิก (EP-04)' },
  kitchen: { title: 'จอครัว (KDS)', sub: 'คิวออเดอร์รวมทุกแบรนด์ · กดรับ/จัดเสร็จ (US-37)' },
  menu: { title: 'จัดการเมนู', sub: 'เพิ่ม/แก้ไข/ลบเมนู · หมวด · เปิด-ปิดขาย · ราคา (US-14)' },
  chat: { title: 'แชต', sub: 'ตอบลูกค้า (US-21) — ส่งเข้า LINE เมื่อเชื่อม SETUP-1' },
  broadcast: { title: 'ส่งข่าวสาร', sub: 'LINE Broadcast — เลือกกลุ่ม + เคารพ opt-out (US-18)' },
  customers: { title: 'ลูกค้า', sub: 'รายชื่อ + ประวัติออเดอร์ + ยอดใช้จ่าย' },
  loyalty: { title: 'สะสมแต้ม', sub: 'สแกนคูปองแลกแต้ม + จัดการของรางวัล (US-53/54)' },
  richmenu: { title: 'Rich Menu', sub: 'เมนู LINE ตามกลุ่มลูกค้า + default · รูป generate อัตโนมัติ' },
  users: { title: 'ผู้ใช้ & สิทธิ์', sub: 'จัดการทีมงาน + บทบาท (US-30)' },
  settings: { title: 'ตั้งค่า', sub: 'บัญชีและการเชื่อมต่อ' },
};

const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'พนักงาน' };

// หน้าไหนอยู่ไหน เก็บใน URL hash (#/orders) → refresh/กด back แล้วยังอยู่หน้าเดิม
const VIEWS = NAV.map((n) => n.key);
const readHash = (): View | null => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (VIEWS as string[]).includes(h) ? (h as View) : null;
};
// แบรนด์ที่เลือกก็เหมือนกัน — ไม่งั้น reload ทีเด้งกลับแบรนด์แรกทุกที
const BRAND_KEY = 'aroihoh.brandId';

/** หน้าล็อกอินจริง (US-29) แทน key-gate เดิม */
function Login({ onSuccess }: { onSuccess: (p: AdminProfile) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    setError('');
    try {
      const { token, admin } = await apiLogin(email, password);
      setAuth(token, admin);
      onSuccess(admin);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="logo">🍚</div>
        <h1>AroiHoh Admin</h1>
        <p>เข้าสู่ระบบหลังบ้าน</p>
        {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}
        <label className="field" style={{ marginBottom: 12 }}>
          <span>อีเมล</span>
          <input value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" />
        </label>
        <label className="field">
          <span>รหัสผ่าน</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy} onClick={submit}>
          {busy ? <span className="spinner" /> : 'เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState<AdminProfile | null>(
    getAdminToken() ? getAdminProfile() : null,
  );
  const [view, setView] = useState<View>(() => readHash() || 'dashboard');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [brandError, setBrandError] = useState('');

  const loadBrands = useCallback(async () => {
    setBrandError('');
    try {
      const bs = await listBrands();
      setBrands(bs);
      setBrandId((cur) => {
        if (cur) return cur;
        const saved = localStorage.getItem(BRAND_KEY);
        return (saved && bs.some((b) => b.id === saved) ? saved : bs[0]?.id) || '';
      });
    } catch (e) {
      setBrandError((e as Error).message);
    }
  }, []);

  const selectBrand = useCallback((id: string) => {
    setBrandId(id);
    localStorage.setItem(BRAND_KEY, id);
  }, []);

  useEffect(() => {
    if (profile) loadBrands();
  }, [profile, loadBrands]);

  // sync view ↔ hash ทั้งสองทาง (กดเมนู → เขียน hash · กด back/แปะ URL → อ่าน hash)
  useEffect(() => {
    const target = `#/${view}`;
    if (window.location.hash !== target) window.location.replace(target);
  }, [view]);

  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (h) setView(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!profile) {
    return <Login onSuccess={setProfile} />;
  }

  const nav = NAV.filter((n) => n.roles.includes(profile.role as Role));
  // US-45: ถ้า view ปัจจุบันไม่อยู่ในสิทธิ์ (เช่น kitchen role) → เด้งไปเมนูแรกที่เห็น
  const activeView = nav.some((n) => n.key === view) ? view : nav[0]?.key;
  if (activeView && activeView !== view) setView(activeView);
  const t = TITLES[activeView || view];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo-row">
          <span className="logo">🍚</span>
          <div>
            <div className="name">AroiHoh</div>
            <div className="tag">Admin Console</div>
          </div>
        </div>
        {nav.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${view === n.key ? 'active' : ''}`}
            onClick={() => {
              window.location.hash = `#/${n.key}`; // push history → ปุ่ม back ใช้ได้
              setView(n.key);
            }}
          >
            <span className="ic">{n.ic}</span>
            {n.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="side-foot">
          {profile.name} · {ROLE_TH[profile.role] || profile.role}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">{t.title}</h1>
            <div className="page-sub">{t.sub}</div>
          </div>
          <div className="topbar-right">
            <label className="field">
              <span>แบรนด์</span>
              <select value={brandId} onChange={(e) => selectBrand(e.target.value)}>
                {brands.length === 0 && <option value="">—</option>}
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <main className="content">
          {brandError && (
            <div className="alert error">โหลดแบรนด์ไม่ได้: {brandError}</div>
          )}
          {view === 'dashboard' && <Dashboard brandId={brandId} />}
          {view === 'orders' && <Orders brandId={brandId} />}
          {view === 'kitchen' && <Kitchen />} {/* US-37: รวมทุกแบรนด์ */}
          {view === 'menu' && <Menu brandId={brandId} />}
          {view === 'chat' && <Chat />} {/* US-40: inbox เดียวรวมทุกแบรนด์ */}
          {view === 'broadcast' && <Broadcast brandId={brandId} />}
          {view === 'customers' && <Customers brandId={brandId} canAdjust={profile.role === 'owner'} />}
          {view === 'loyalty' && (
            <Loyalty brandId={brandId} canManage={profile.role === 'owner' || profile.role === 'manager'} />
          )}
          {view === 'richmenu' && <RichMenu brandId={brandId} />}
          {view === 'users' && <Users brands={brands} selfId={profile.id} />}
          {view === 'settings' && (
            <Settings
              profile={profile}
              brandId={brandId}
              brands={brands}
              onBrandsChanged={loadBrands}
            />
          )}
        </main>
      </div>
    </div>
  );
}
