import { useState } from 'react';
import {
  API_BASE,
  clearAuth,
  setBrandCod,
  ROLE_TH,
  type AdminProfile,
  type Brand,
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
  const brand = brands.find((b) => b.id === brandId);
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  const signOut = () => {
    clearAuth();
    location.reload();
  };

  const toggleCod = async () => {
    if (!brand) return;
    setBusy(true);
    setError('');
    try {
      await setBrandCod(brand.id, !brand.codEnabled);
      onBrandsChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 520 }}>
      {error && <div className="alert error">{error}</div>}

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

      {canManage && brand && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>ตั้งค่าร้าน — {brand.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="switch">
              <input type="checkbox" checked={!!brand.codEnabled} disabled={busy} onChange={toggleCod} />
              <span className="slider" />
            </label>
            <div>
              <div style={{ fontWeight: 600 }}>รับเงินปลายทาง (COD)</div>
              <div className="pay">{brand.codEnabled ? 'เปิดรับ' : 'ปิดรับ'} — ลูกค้าเลือกจ่ายปลายทางได้</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>การเชื่อมต่อ</h2>
        <div className="pay">API base</div>
        <div className="oid">{API_BASE}</div>
      </div>
    </div>
  );
}
