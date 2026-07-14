import { useCallback, useEffect, useState } from 'react';
import { listKitchens, createKitchen, updateKitchen, baht, type Kitchen } from '../../api';

type Form = { name: string; lat: string; lng: string; maxDistanceKm: string; flatFeeBaht: string };
const EMPTY: Form = { name: '', lat: '', lng: '', maxDistanceKm: '5', flatFeeBaht: '' };

// US-44: จัดการครัว/location (owner) — สร้าง/แก้ครัว + จุดพิกัด + รัศมีเขตส่ง + ค่าส่งคงที่
export default function KitchenManager() {
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setKitchens(await listKitchens());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setF(EMPTY);
    setEditing('new');
    setError('');
  };
  const openEdit = (k: Kitchen) => {
    setF({
      name: k.name,
      lat: String(k.lat ?? ''),
      lng: String(k.lng ?? ''),
      maxDistanceKm: String(k.maxDistanceKm ?? 5),
      flatFeeBaht: k.flatFee != null ? String(k.flatFee / 100) : '',
    });
    setEditing(k.id);
    setError('');
  };

  const save = async () => {
    const lat = parseFloat(f.lat), lng = parseFloat(f.lng), km = parseFloat(f.maxDistanceKm);
    if (!f.name.trim() || isNaN(lat) || isNaN(lng) || isNaN(km)) {
      setError('กรอกชื่อ, พิกัด (lat/lng) และรัศมีให้ครบ');
      return;
    }
    const flatFee = f.flatFeeBaht.trim() === '' ? undefined : Math.round(parseFloat(f.flatFeeBaht) * 100);
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        await createKitchen({ name: f.name.trim(), lat, lng, maxDistanceKm: km, flatFee: flatFee ?? 0 });
      } else if (editing) {
        await updateKitchen(editing, { name: f.name.trim(), lat, lng, maxDistanceKm: km, flatFee });
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        ครัว / จุดจัดส่ง
        {editing === null && <button className="btn" onClick={openNew} disabled={busy}>+ เพิ่มครัว</button>}
      </h2>
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {kitchens.map((k) => (
          <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #eee', borderRadius: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{k.name}</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                📍 {k.lat?.toFixed(4)}, {k.lng?.toFixed(4)} · รัศมี {k.maxDistanceKm} กม. ·{' '}
                {k.feeType === 'flat' && k.flatFee != null ? `ค่าส่ง ${baht(k.flatFee)}` : k.feeType ? `ค่าส่ง ${k.feeType}` : 'ยังไม่ตั้งค่าส่ง'} · {k.brandCount} แบรนด์
              </div>
            </div>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => openEdit(k)} disabled={busy}>แก้ไข</button>
          </div>
        ))}
        {kitchens.length === 0 && editing === null && <div className="pay">ยังไม่มีครัว</div>}
      </div>

      {editing !== null && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #eee', display: 'grid', gap: 10, maxWidth: 420 }}>
          <div style={{ fontWeight: 700 }}>{editing === 'new' ? 'เพิ่มครัวใหม่' : 'แก้ไขครัว'}</div>
          <label style={{ fontSize: 13 }}>ชื่อครัว
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น ครัวกลางอโศก" style={{ width: '100%', marginTop: 4 }} />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ fontSize: 13, flex: 1 }}>Latitude
              <input value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="13.7376" style={{ width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, flex: 1 }}>Longitude
              <input value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="100.5602" style={{ width: '100%', marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ fontSize: 13, flex: 1 }}>รัศมีเขตส่ง (กม.)
              <input value={f.maxDistanceKm} onChange={(e) => setF({ ...f, maxDistanceKm: e.target.value })} placeholder="5" style={{ width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, flex: 1 }}>ค่าส่งคงที่ (บาท)
              <input value={f.flatFeeBaht} onChange={(e) => setF({ ...f, flatFeeBaht: e.target.value })} placeholder="เว้นว่าง = ไม่เปลี่ยน" style={{ width: '100%', marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : 'บันทึก'}</button>
            <button className="btn" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            💡 พิกัดจาก Google Maps: คลิกขวาจุดครัว → คัดลอกเลข lat, lng · ตั้งค่าส่งคงที่ = คิดเท่ากันทุกออเดอร์ในเขต
          </div>
        </div>
      )}
    </div>
  );
}
