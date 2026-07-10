import { useEffect, useState, useCallback } from 'react';
import {
  listMenu,
  listMenuCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createMenuCategory,
  setItemAvailability,
  baht,
  type MenuItem,
  type MenuCategory,
} from '../api';

type FormState = {
  name: string;
  price: string; // บาท (แปลงเป็นสตางค์ตอนบันทึก)
  description: string;
  imageUrl: string;
  categoryId: string; // '' = ไม่มีหมวด
};

const EMPTY: FormState = { name: '', price: '', description: '', imageUrl: '', categoryId: '' };

export default function Menu({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cats, setCats] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // ฟอร์มสร้าง/แก้ไข — editing=null คือสร้างใหม่
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [f, setF] = useState<FormState>(EMPTY);
  const [newCat, setNewCat] = useState('');

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      const [i, c] = await Promise.all([listMenu(brandId), listMenuCategories(brandId)]);
      setItems(i);
      setCats(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  const catName = (id: string | null) =>
    (id && cats.find((c) => c.id === id)?.name) || 'ไม่มีหมวด';

  // จัดกลุ่มตามหมวด (เรียงตาม sortOrder) แล้วปิดท้ายด้วยรายการไม่มีหมวด
  const groups: { key: string; name: string; items: MenuItem[] }[] = [];
  for (const c of cats) {
    const its = items.filter((i) => i.categoryId === c.id);
    if (its.length) groups.push({ key: c.id, name: c.name, items: its });
  }
  const uncat = items.filter((i) => !i.categoryId || !cats.some((c) => c.id === i.categoryId));
  if (uncat.length) groups.push({ key: '__none', name: 'ไม่มีหมวด', items: uncat });

  const openNew = () => {
    setEditing(null);
    setF(EMPTY);
    setShowForm(true);
    setError('');
  };
  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setF({
      name: it.name,
      price: (it.price / 100).toString(),
      description: it.description || '',
      imageUrl: it.imageUrl || '',
      categoryId: it.categoryId || '',
    });
    setShowForm(true);
    setError('');
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setF(EMPTY);
  };

  const save = async () => {
    const name = f.name.trim();
    if (!name) return setError('กรอกชื่อเมนู');
    const bahtVal = Number(f.price);
    if (!Number.isFinite(bahtVal) || bahtVal < 0) return setError('ราคาไม่ถูกต้อง');
    const price = Math.round(bahtVal * 100);
    setBusy('form');
    setError('');
    try {
      if (editing) {
        await updateMenuItem(brandId, editing.id, {
          name,
          price,
          description: f.description.trim() || null,
          imageUrl: f.imageUrl.trim() || null,
          categoryId: f.categoryId || null,
        });
      } else {
        await createMenuItem(brandId, {
          name,
          price,
          description: f.description.trim() || undefined,
          imageUrl: f.imageUrl.trim() || undefined,
          categoryId: f.categoryId || undefined,
        });
      }
      closeForm();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (it: MenuItem) => {
    setBusy(it.id);
    try {
      await setItemAvailability(brandId, it.id, !it.isAvailable);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (it: MenuItem) => {
    if (!window.confirm(`ลบเมนู "${it.name}" ถาวร?`)) return;
    setBusy(it.id);
    try {
      await deleteMenuItem(brandId, it.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    setBusy('cat');
    setError('');
    try {
      await createMenuCategory(brandId, name, cats.length);
      setNewCat('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}

      <div className="section-head">
        <h2>เมนูทั้งหมด ({items.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻'} รีเฟรช
          </button>
          <button className="btn primary sm" onClick={openNew}>+ เพิ่มเมนู</button>
        </div>
      </div>

      {/* ฟอร์มสร้าง/แก้ไข */}
      {showForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 12, maxWidth: 560 }}>
          <div style={{ fontWeight: 700 }}>{editing ? `แก้ไข: ${editing.name}` : 'เพิ่มเมนูใหม่'}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 2, minWidth: 200 }}>
              <span>ชื่อเมนู</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น กะเพราไก่ไข่ดาว" />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 100 }}>
              <span>ราคา (บาท)</span>
              <input type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="60" />
            </label>
          </div>
          <label className="field">
            <span>หมวด</span>
            <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">— ไม่มีหมวด —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>รายละเอียด (ไม่บังคับ)</span>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="ราดข้าว ไข่ดาวกรอบ" />
          </label>
          <label className="field">
            <span>รูป URL (ไม่บังคับ)</span>
            <input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://…" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" disabled={busy === 'form'} onClick={save}>
              {busy === 'form' ? <span className="spinner" /> : editing ? 'บันทึกการแก้ไข' : 'สร้างเมนู'}
            </button>
            <button className="btn ghost" disabled={busy === 'form'} onClick={closeForm}>ยกเลิก</button>
          </div>
        </div>
      )}

      {/* จัดการหมวด */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="pay" style={{ fontWeight: 600 }}>หมวด ({cats.length}):</span>
        {cats.map((c) => <span key={c.id} className="pill on">{c.name}</span>)}
        {cats.length === 0 && <span className="pay">ยังไม่มีหมวด</span>}
        <span style={{ flex: 1 }} />
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          placeholder="เพิ่มหมวด…"
          style={{ width: 160 }}
        />
        <button className="btn ghost sm" disabled={busy === 'cat' || !newCat.trim()} onClick={addCategory}>+ หมวด</button>
      </div>

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div className="section-head"><h2 style={{ fontSize: 15 }}>{g.name} ({g.items.length})</h2></div>
          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>เมนู</th>
                    <th>ราคา</th>
                    <th>เปิดขาย</th>
                    <th style={{ textAlign: 'right' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {it.imageUrl && (
                            <img src={it.imageUrl} alt="" width={36} height={36}
                              style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{it.name}</div>
                            {it.description && <div className="pay">{it.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="total">{baht(it.price)}</td>
                      <td>
                        <label className="switch">
                          <input type="checkbox" checked={it.isAvailable} disabled={busy === it.id} onChange={() => toggle(it)} />
                          <span className="slider" />
                        </label>
                        <span className={`pill ${it.isAvailable ? 'on' : 'off'}`} style={{ marginLeft: 10 }}>
                          {it.isAvailable ? 'เปิดขาย' : 'ปิดขาย'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn ghost sm" disabled={busy === it.id} onClick={() => openEdit(it)}>แก้ไข</button>
                        <button className="btn danger sm" disabled={busy === it.id} onClick={() => remove(it)} style={{ marginLeft: 6 }}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {!loading && items.length === 0 && (
        <div className="card"><div className="state"><span className="emoji">🍜</span> ยังไม่มีเมนู — กด "+ เพิ่มเมนู"</div></div>
      )}
      {loading && items.length === 0 && (
        <div className="card"><div className="state"><span className="spinner" /> กำลังโหลด…</div></div>
      )}
    </>
  );
}
