import { useEffect, useState, useCallback } from 'react';
import { getAdminKey, setAdminKey, listBrands, type Brand } from './api';
import Dashboard from './views/Dashboard';
import Orders from './views/Orders';
import Menu from './views/Menu';
import Settings from './views/Settings';

type View = 'dashboard' | 'orders' | 'menu' | 'settings';

const NAV: { key: View; label: string; ic: string }[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', ic: '🏠' },
  { key: 'orders', label: 'ออเดอร์', ic: '🧾' },
  { key: 'menu', label: 'เมนู', ic: '🍜' },
  { key: 'settings', label: 'ตั้งค่า', ic: '⚙️' },
];

const TITLES: Record<View, { title: string; sub: string }> = {
  dashboard: { title: 'แดชบอร์ด', sub: 'ภาพรวมออเดอร์และยอดขาย' },
  orders: { title: 'จัดการออเดอร์', sub: 'ไล่สถานะ / ยกเลิก (EP-04)' },
  menu: { title: 'จัดการเมนู', sub: 'เปิด-ปิดขาย / แก้ราคา (US-14)' },
  settings: { title: 'ตั้งค่า', sub: 'การเข้าถึงและการเชื่อมต่อ' },
};

/** หน้ากรอก key ก่อนเข้าใช้ (ชั่วคราว — จะแทนด้วย login จริง US-29) */
function KeyGate({ onEnter }: { onEnter: () => void }) {
  const [key, setKey] = useState('');
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="logo">🍚</div>
        <h1>AroiHoh Admin</h1>
        <p>ใส่ admin key เพื่อเข้าใช้งานหลังบ้าน (ชั่วคราว รอระบบล็อกอินจริง)</p>
        <label className="field">
          <span>admin key</span>
          <input
            type="password"
            value={key}
            autoFocus
            placeholder="x-admin-key"
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && key.trim() && (setAdminKey(key.trim()), onEnter())}
          />
        </label>
        <button
          className="btn primary block"
          style={{ marginTop: 16 }}
          disabled={!key.trim()}
          onClick={() => {
            setAdminKey(key.trim());
            onEnter();
          }}
        >
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [hasKey, setHasKey] = useState(!!getAdminKey());
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
    if (hasKey) loadBrands();
  }, [hasKey, loadBrands]);

  if (!hasKey) {
    return <KeyGate onEnter={() => setHasKey(true)} />;
  }

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
        {NAV.map((n) => (
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
        <div className="side-foot">เฟส A · ชิมชีวา One Price 60</div>
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
            <div className="alert error">
              โหลดแบรนด์ไม่ได้: {brandError} — ตรวจ admin key ที่หน้า “ตั้งค่า”
            </div>
          )}
          {view === 'dashboard' && <Dashboard brandId={brandId} />}
          {view === 'orders' && <Orders brandId={brandId} />}
          {view === 'menu' && <Menu brandId={brandId} />}
          {view === 'settings' && <Settings onSaved={loadBrands} />}
        </main>
      </div>
    </div>
  );
}
