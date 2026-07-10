import { useEffect, useState, useCallback } from 'react';
import {
  API_BASE,
  clearAuth,
  setBrandCod,
  getStore,
  setStorePause,
  setStoreHours,
  ROLE_TH,
  type AdminProfile,
  type Brand,
  type StoreState,
} from '../api';

export default function Settings({
  profile,
  brandId,
  brands,
  onBrandsChanged,
}: {
  profile: AdminProfile | null;
  brandId: string;
  brands: Brand[];
  onBrandsChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [store, setStore] = useState<StoreState | null>(null);
  const [hours, setHours] = useState({ open: '', close: '' });
  const brand = brands.find((b) => b.id === brandId);
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  const loadStore = useCallback(async () => {
    if (!brandId) return;
    try {
      const s = await getStore(brandId);
      setStore(s);
      setHours({ open: s.openTime || '', close: s.closeTime || '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brandId]);

  useEffect(() => {
    if (canManage) loadStore();
  }, [canManage, loadStore]);

  const signOut = () => {
    clearAuth();
    location.reload();
  };

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCod = () => brand && wrap(async () => { await setBrandCod(brand.id, !brand.codEnabled); onBrandsChanged(); });
  const togglePause = () => store && wrap(async () => setStore(await setStorePause(brandId, !store.isOpen)));
  const saveHours = () => wrap(async () => setStore(await setStoreHours(brandId, hours.open || null, hours.close || null)));
  const clearHours = () => wrap(async () => { setHours({ open: '', close: '' }); setStore(await setStoreHours(brandId, null, null)); });

  return (
    <div style={{ maxWidth: 520 }}>
      {error && <div className="alert error">{error}</div>}

      {/* store hours + pause (US-16) */}
      {canManage && store && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between' }}>
            สถานะร้าน — {store.name}
            <span className={`pill ${store.acceptingNow ? 'on' : 'off'}`}>
              {store.acceptingNow ? 'รับออเดอร์อยู่' : store.reason || 'ปิด'}
            </span>
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label className="switch">
              <input type="checkbox" checked={store.isOpen} disabled={busy} onChange={togglePause} />
              <span className="slider" />
            </label>
            <div>
              <div style={{ fontWeight: 600 }}>เปิดรับออเดอร์</div>
              <div className="pay">ปิดสวิตช์ = พักรับออเดอร์ฉุกเฉิน (ครัวล้น/ของหมด)</div>
            </div>
          </div>

          <div className="pay" style={{ marginBottom: 6 }}>เวลาทำการ (ว่าง = เปิดตลอด)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} />
            <span>–</span>
            <input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} />
            <button className="btn primary sm" disabled={busy} onClick={saveHours}>บันทึก</button>
            <button className="btn ghost sm" disabled={busy} onClick={clearHours}>ล้าง</button>
          </div>
        </div>
      )}

      {/* COD (US-07) */}
      {canManage && brand && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>รับเงินปลายทาง (COD)</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="switch">
              <input type="checkbox" checked={!!brand.codEnabled} disabled={busy} onChange={toggleCod} />
              <span className="slider" />
            </label>
            <div className="pay">{brand.codEnabled ? 'เปิดรับ' : 'ปิดรับ'} — ลูกค้าเลือกจ่ายปลายทางได้</div>
          </div>
        </div>
      )}

      {/* account */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>บัญชีของฉัน</h2>
        {profile ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><b>{profile.name}</b></div>
            <div className="pay">{profile.email}</div>
            <div>บทบาท: <span className="pill on">{ROLE_TH[profile.role] || profile.role}</span></div>
          </div>
        ) : (
          <div className="pay">—</div>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="btn danger" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>การเชื่อมต่อ</h2>
        <div className="pay">API base</div>
        <div className="oid">{API_BASE}</div>
      </div>
    </div>
  );
}
