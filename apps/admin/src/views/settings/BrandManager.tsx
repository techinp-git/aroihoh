import { useCallback, useEffect, useState } from 'react';
import {
  listKitchens,
  createBrand,
  updateBrand,
  type Brand,
  type Kitchen,
} from '../../api';

// slug จากชื่อ: a-z 0-9 - เท่านั้น
const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// US-36: จัดการแบรนด์ (owner) — เพิ่มแบรนด์ + ผูกครัว · โครง House of Brands (แต่ละแบรนด์ = identity แยก)
export default function BrandManager({
  brands,
  onChanged,
}: {
  brands: Brand[];
  onChanged: () => void;
}) {
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadKitchens = useCallback(async () => {
    try {
      setKitchens(await listKitchens());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    loadKitchens();
  }, [loadKitchens]);

  const kitchenName = (id: string) => kitchens.find((k) => k.id === id)?.name || id.slice(0, 6);

  const resetForm = () => {
    setName(''); setSlug(''); setSlugTouched(false); setPicked([]); setAdding(false); setError('');
  };

  const submit = async () => {
    if (!name.trim() || !slug.trim() || picked.length === 0) {
      setError('กรอกชื่อ, slug และเลือกครัวอย่างน้อย 1');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createBrand({ name: name.trim(), slug: slug.trim(), kitchenIds: picked });
      resetForm();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (b: Brand) => {
    setBusy(true);
    setError('');
    try {
      await updateBrand(b.id, { isActive: !b.isActive });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        แบรนด์ในร้าน
        {!adding && (
          <button className="btn" onClick={() => setAdding(true)} disabled={busy}>+ เพิ่มแบรนด์</button>
        )}
      </h2>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* รายการแบรนด์ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {brands.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #eee', borderRadius: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{b.name} <span style={{ color: '#999', fontSize: 12 }}>/{b.slug}</span></div>
              <div style={{ fontSize: 12, color: '#888' }}>
                ครัว: {(b.brandKitchens || []).map((bk) => kitchenName(bk.kitchenId)).join(', ') || '—'}
              </div>
            </div>
            <span className={`pill ${b.isActive ? 'on' : 'off'}`} style={{ fontSize: 11 }}>
              {b.isActive ? 'เปิด' : 'ปิด'}
            </span>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => toggleActive(b)} disabled={busy}>
              {b.isActive ? 'ปิด' : 'เปิด'}
            </button>
          </div>
        ))}
      </div>

      {/* ฟอร์มเพิ่มแบรนด์ */}
      {adding && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #eee' }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
            ชื่อแบรนด์
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(toSlug(e.target.value));
              }}
              placeholder="เช่น A La Carte พรีเมียม"
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
            slug (ใช้ใน URL/LIFF)
            <input
              value={slug}
              onChange={(e) => { setSlug(toSlug(e.target.value)); setSlugTouched(true); }}
              placeholder="ala-carte"
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>ครัวที่ใช้ (เลือกได้หลายครัว)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {kitchens.length === 0 && <span style={{ color: '#999', fontSize: 12 }}>ยังไม่มีครัว (สร้างที่ US-44)</span>}
            {kitchens.map((k) => (
              <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, padding: '4px 10px', border: `1px solid ${picked.includes(k.id) ? '#e8734a' : '#ddd'}`, borderRadius: 999, cursor: 'pointer', background: picked.includes(k.id) ? '#fdf0ea' : '#fff' }}>
                <input type="checkbox" checked={picked.includes(k.id)} onChange={() => togglePick(k.id)} style={{ margin: 0 }} />
                {k.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={submit} disabled={busy}>
              {busy ? <span className="spinner" /> : 'สร้างแบรนด์'}
            </button>
            <button className="btn" onClick={resetForm} disabled={busy}>ยกเลิก</button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
            💡 สร้างเสร็จ → ไปการ์ด "เชื่อมต่อ LINE OA" เลือกแบรนด์นี้ด้านบน แล้วเสียบ OA แยกของแบรนด์
          </div>
        </div>
      )}
    </div>
  );
}
