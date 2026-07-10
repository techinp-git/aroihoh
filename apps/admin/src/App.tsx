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
import Menu from './views/Menu';
import Users from './views/Users';
import Settings from './views/Settings';

type View = 'dashboard' | 'orders' | 'menu' | 'users' | 'settings';

const NAV: { key: View; label: string; ic: string; ownerOnly?: boolean }[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', ic: '🏠' },
  { key: 'orders', label: 'ออเดอร์', ic: '🧾' },
  { key: 'menu', label: 'เมนู', ic: '🍜' },
  { key: 'users', label: 'ผู้ใช้ & สิทธิ์', ic: '👥', ownerOnly: true },
  { key: 'settings', label: 'ตั้งค่า', ic: '⚙️' },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  dashboard: { title: 'แดชบอร์ด', sub: 'ภาพรวมออเดอร์และยอดขาย' },
  orders: { title: 'จัดการออเดอร์', sub: 'ไล่สถานะ / ยกเลิก (EP-04)' },
  menu: { title: 'จัดการเมนู', sub: 'เปิด-ปิดขาย / แก้ราคา (US-14)' },
  users: { title: 'ผู้ใช้ & สิทธิ์', sub: 'จัดการทีมงาน + บทบาท (US-30)' },
  settings: { title: 'ตั้งค่า', sub: 'บัญชีและการเชื่อมต่อ' },
};

const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'พนักงาน' };

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
  const [view, setView] = useState<View>('dashboard');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [brandError, setBrandError] = useState('');

  const loadBrands = useCallback(async () => {
    setBrandError('');
    try {
      const bs = await listBrands();
      setBrands(bs);
      setBrandId((cur) => cur || bs[0]?.id || '');
    } catch (e) {
      setBrandError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (profile) loadBrands();
  }, [profile, loadBrands]);

  if (!profile) {
    return <Login onSuccess={setProfile} />;
  }

  const nav = NAV.filter((n) => !n.ownerOnly || profile.role === 'owner');
  const t = TITLES[view];

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
            onClick={() => setView(n.key)}
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
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
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
          {view === 'menu' && <Menu brandId={brandId} />}
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
