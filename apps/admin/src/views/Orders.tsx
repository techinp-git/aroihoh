import { useEffect, useState, useCallback } from 'react';
import {
  listOrders,
  changeStatus,
  baht,
  STATUS_TH,
  ALL_STATUSES,
  nextStatus,
  type Order,
} from '../api';

export default function Orders({ brandId }: { brandId: string }) {
  const [filter, setFilter] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      setOrders(await listOrders(brandId, filter || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (o: Order, run: () => Promise<unknown>) => {
    setBusy(o.id);
    try {
      await run();
      await load();
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
    const r = window.prompt(`เหตุผลการยกเลิกออเดอร์ #${o.id.slice(0, 8)}`);
    if (r?.trim()) act(o, () => changeStatus(brandId, o.id, 'cancelled', r.trim()));
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}

      <div className="section-head">
        <div className="tabs">
          {['', ...ALL_STATUSES].map((f) => (
            <button key={f || 'all'} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f ? STATUS_TH[f] : 'ทั้งหมด'}
            </button>
          ))}
        </div>
        <button className="btn ghost sm" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : '↻'} รีเฟรช
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
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
                      {new Date(o.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
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
                      <div className="pay">{o.paymentMethod} · {o.paymentStatus}</div>
                    </td>
                    <td>
                      <span className={`pill ${o.status}`}>{STATUS_TH[o.status] || o.status}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {!terminal && to && (
                          <button className="btn primary sm" disabled={busy === o.id} onClick={() => advance(o)}>
                            → {STATUS_TH[to]}
                          </button>
                        )}
                        {!terminal && (
                          <button className="btn danger sm" disabled={busy === o.id} onClick={() => cancel(o)}>
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
        {loading && orders.length === 0 && (
          <div className="state"><span className="spinner" /> กำลังโหลด…</div>
        )}
      </div>
    </>
  );
}
