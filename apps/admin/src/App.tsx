import { useEffect, useState, useCallback, useMemo } from 'react';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';
import {
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

function nextStatus(s: string): string | null {
  const i = (ORDER_STATUS_FLOW as readonly string[]).indexOf(s);
  return i >= 0 && i < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[i + 1] : null;
}

const ACTIVE = new Set(['pending', 'confirmed', 'preparing', 'delivering']);
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
      setBrandId((cur) => cur || bs[0]?.id || '');
    } catch (e) {
      setError(`โหลดแบรนด์ไม่ได้: ${(e as Error).message}`);
    }
  }, []);

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

  const act = async (o: Order, run: () => Promise<unknown>) => {
    setBusy(o.id);
    try {
      await run();
      await loadOrders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const advance = (o: Order) => {
    const to = nextStatus(o.status);
    if (to) act(o, () => changeStatus(brandId, o.id, to));
  };
  const cancel = (o: Order) => {
    const reason = window.prompt(`เหตุผลการยกเลิกออเดอร์ #${o.id.slice(0, 8)}`);
    if (reason?.trim()) act(o, () => changeStatus(brandId, o.id, 'cancelled', reason.trim()));
  };

  const stats = useMemo(() => {
    const active = orders.filter((o) => ACTIVE.has(o.status)).length;
    const revenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + o.total, 0);
    return { total: orders.length, active, revenue };
  }, [orders]);

  const needsKey = !getAdminKey();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🍚</span>
          <div>
            <h1>AroiHoh</h1>
            <span className="sub">Admin · จัดการออเดอร์</span>
          </div>
        </div>
        <div className="topbar-right">
          <label className="field">
            <span>admin key</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="x-admin-key"
            />
          </label>
          <button className="btn ghost sm" onClick={saveKey} style={{ alignSelf: 'flex-end' }}>
            บันทึก
          </button>
          <label className="field">
            <span>แบรนด์</span>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.length === 0 && <option value="">—</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="container">
        {error && <div className="alert">{error}</div>}
        {needsKey && (
          <div className="alert" style={{ background: 'var(--accent-weak)', color: 'var(--accent)', borderColor: '#ffd8bf' }}>
            ใส่ admin key มุมขวาบนแล้วกด “บันทึก” เพื่อเริ่มใช้งาน
          </div>
        )}

        <section className="stats">
          <div className="stat">
            <div className="stat-label">ออเดอร์ (ที่แสดง)</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat">
            <div className="stat-label">กำลังดำเนินการ</div>
            <div className="stat-value">{stats.active}</div>
          </div>
          <div className="stat">
            <div className="stat-label">ยอดขาย (ไม่รวมยกเลิก)</div>
            <div className="stat-value accent">{baht(stats.revenue)}</div>
          </div>
        </section>

        <div className="toolbar">
          <div className="tabs">
            {FILTERS.map((f) => (
              <button
                key={f || 'all'}
                className={`tab ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f ? STATUS_TH[f] : 'ทั้งหมด'}
              </button>
            ))}
          </div>
          <button className="btn ghost sm" onClick={loadOrders} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻'} รีเฟรช
          </button>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="orders">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ออเดอร์</th>
                  <th>รายการ</th>
                  <th>ยอด</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const to = nextStatus(o.status);
                  const terminal = o.status === 'completed' || o.status === 'cancelled';
                  return (
                    <tr key={o.id}>
                      <td className="time">
                        {new Date(o.createdAt).toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <div className="oid" title={o.id}>#{o.id.slice(0, 8)}</div>
                        {o.cancelReason && <div className="reason">เหตุ: {o.cancelReason}</div>}
                      </td>
                      <td>
                        <div className="items-list">
                          {o.items.map((it) => (
                            <span key={it.id} className="item-line">
                              {it.nameSnapshot} <span className="item-qty">×{it.qty}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="total">{baht(o.total)}</div>
                        <div className="pay">
                          {o.paymentMethod} · {o.paymentStatus}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${o.status}`}>{STATUS_TH[o.status] || o.status}</span>
                      </td>
                      <td>
                        <div className="actions">
                          {!terminal && to && (
                            <button
                              className="btn primary sm"
                              disabled={busy === o.id}
                              onClick={() => advance(o)}
                            >
                              → {STATUS_TH[to]}
                            </button>
                          )}
                          {!terminal && (
                            <button
                              className="btn danger sm"
                              disabled={busy === o.id}
                              onClick={() => cancel(o)}
                            >
                              ยกเลิก
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && orders.length === 0 && (
            <div className="state">
              <span className="emoji">🧾</span>
              ยังไม่มีออเดอร์ในหมวดนี้
            </div>
          )}
          {loading && (
            <div className="state">
              <span className="spinner" /> กำลังโหลด…
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
