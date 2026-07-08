import { useEffect, useState, useCallback } from 'react';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';
import {
  API_BASE,
  getAdminKey,
  setAdminKey,
  listBrands,
  listOrders,
  changeStatus,
  baht,
  type Brand,
  type Order,
} from './api';

const STATUS_TH: Record<string, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'รับออเดอร์',
  preparing: 'กำลังทำ',
  delivering: 'ออกส่ง',
  completed: 'ส่งสำเร็จ',
  cancelled: 'ยกเลิก',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#b8860b',
  confirmed: '#1e6fd9',
  preparing: '#8a5cd1',
  delivering: '#0a8f6a',
  completed: '#2e7d32',
  cancelled: '#b03030',
};

function nextStatus(s: string): string | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(s);
  return i >= 0 && i < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[i + 1] : null;
}

const FILTERS = ['', ...ORDER_STATUS_FLOW, 'cancelled'];

export default function App() {
  const [key, setKey] = useState(getAdminKey());
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    setError('');
    try {
      const bs = await listBrands();
      setBrands(bs);
      if (bs.length && !brandId) setBrandId(bs[0].id);
    } catch (e) {
      setError(`โหลดแบรนด์ไม่ได้: ${(e as Error).message}`);
    }
  }, [brandId]);

  const loadOrders = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      setOrders(await listOrders(brandId, statusFilter || undefined));
    } catch (e) {
      setError(`โหลดออเดอร์ไม่ได้: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [brandId, statusFilter]);

  useEffect(() => {
    if (getAdminKey()) loadBrands();
  }, [loadBrands]);
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const saveKey = () => {
    setAdminKey(key.trim());
    loadBrands();
  };

  const advance = async (o: Order) => {
    const to = nextStatus(o.status);
    if (!to) return;
    setBusy(o.id);
    try {
      await changeStatus(brandId, o.id, to);
      await loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (o: Order) => {
    const reason = window.prompt(`เหตุผลการยกเลิกออเดอร์ #${o.id.slice(0, 8)}`);
    if (!reason?.trim()) return; // ยกเลิกต้องมีเหตุผล (server บังคับด้วย)
    setBusy(o.id);
    try {
      await changeStatus(brandId, o.id, 'cancelled', reason.trim());
      await loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1 style={{ marginBottom: 4 }}>AroiHoh Admin 🛠️</h1>
      <p style={{ color: '#666', marginTop: 0, fontSize: 13 }}>
        จัดการออเดอร์ (EP-04) · API: {API_BASE}
      </p>

      {/* config bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        <label style={{ fontSize: 13 }}>
          admin key:{' '}
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="x-admin-key"
            style={{ padding: 4 }}
          />
        </label>
        <button onClick={saveKey}>บันทึก key + โหลด</button>
        <label style={{ fontSize: 13, marginLeft: 8 }}>
          แบรนด์:{' '}
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.length === 0 && <option value="">— (ยังไม่มี) —</option>}
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          สถานะ:{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f || 'all'} value={f}>
                {f ? STATUS_TH[f] : 'ทั้งหมด'}
              </option>
            ))}
          </select>
        </label>
        <button onClick={loadOrders}>รีเฟรช</button>
      </div>

      {error && (
        <div style={{ background: '#fdecea', color: '#b03030', padding: 10, borderRadius: 6, marginTop: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: 13, color: '#666' }}>
        {loading ? 'กำลังโหลด…' : `${orders.length} ออเดอร์`}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>เวลา</th>
            <th style={{ padding: 8 }}>ออเดอร์</th>
            <th style={{ padding: 8 }}>รายการ</th>
            <th style={{ padding: 8 }}>ยอด</th>
            <th style={{ padding: 8 }}>สถานะ</th>
            <th style={{ padding: 8 }}>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const to = nextStatus(o.status);
            const terminal = o.status === 'completed' || o.status === 'cancelled';
            return (
              <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  {new Date(o.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace' }} title={o.id}>
                  #{o.id.slice(0, 8)}
                  {o.cancelReason && (
                    <div style={{ color: '#b03030', fontSize: 11 }}>เหตุ: {o.cancelReason}</div>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {o.items.map((it) => (
                    <div key={it.id} style={{ fontSize: 12 }}>
                      {it.nameSnapshot} ×{it.qty}
                    </div>
                  ))}
                </td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  {baht(o.total)}
                  <div style={{ fontSize: 11, color: '#888' }}>
                    ({o.paymentMethod}/{o.paymentStatus})
                  </div>
                </td>
                <td style={{ padding: 8 }}>
                  <span style={{ background: STATUS_COLOR[o.status] || '#666', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                    {STATUS_TH[o.status] || o.status}
                  </span>
                </td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                  {!terminal && to && (
                    <button disabled={busy === o.id} onClick={() => advance(o)} style={{ marginRight: 6 }}>
                      → {STATUS_TH[to]}
                    </button>
                  )}
                  {!terminal && (
                    <button disabled={busy === o.id} onClick={() => cancel(o)} style={{ color: '#b03030' }}>
                      ยกเลิก
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!loading && orders.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                ไม่มีออเดอร์
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
