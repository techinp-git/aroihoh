import { useEffect, useState, useCallback } from 'react';
import {
  listMenu,
  setItemAvailability,
  updateItemPrice,
  baht,
  type MenuItem,
} from '../api';

export default function Menu({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listMenu(brandId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const editPrice = async (it: MenuItem) => {
    const cur = (it.price / 100).toString();
    const input = window.prompt(`ราคาใหม่ของ "${it.name}" (บาท)`, cur);
    if (input == null) return;
    const bahtVal = Number(input);
    if (!Number.isFinite(bahtVal) || bahtVal < 0) {
      setError('ราคาไม่ถูกต้อง');
      return;
    }
    setBusy(it.id);
    try {
      await updateItemPrice(brandId, it.id, Math.round(bahtVal * 100));
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
        <button className="btn ghost sm" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : '↻'} รีเฟรช
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>เมนู</th>
                <th>ราคา</th>
                <th>เปิดขาย</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    {it.description && <div className="pay">{it.description}</div>}
                  </td>
                  <td className="total">{baht(it.price)}</td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={it.isAvailable}
                        disabled={busy === it.id}
                        onChange={() => toggle(it)}
                      />
                      <span className="slider" />
                    </label>
                    <span className={`pill ${it.isAvailable ? 'on' : 'off'}`} style={{ marginLeft: 10 }}>
                      {it.isAvailable ? 'เปิดขาย' : 'ปิดขาย'}
                    </span>
                  </td>
                  <td>
                    <button className="btn ghost sm" disabled={busy === it.id} onClick={() => editPrice(it)}>
                      แก้ราคา
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && (
          <div className="state">
            <span className="emoji">🍜</span>
            ยังไม่มีเมนู
          </div>
        )}
        {loading && items.length === 0 && (
          <div className="state"><span className="spinner" /> กำลังโหลด…</div>
        )}
      </div>
    </>
  );
}
