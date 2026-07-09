import { useEffect, useState, useMemo } from 'react';
import {
  listOrders,
  baht,
  STATUS_TH,
  ACTIVE_STATUSES,
  type Order,
} from '../api';

export default function Dashboard({ brandId }: { brandId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    setLoading(true);
    setError('');
    listOrders(brandId)
      .then((o) => alive && setOrders(o))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [brandId]);

  const s = useMemo(() => {
    const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length;
    const completed = orders.filter((o) => o.status === 'completed').length;
    const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.total, 0);
    return { total: orders.length, active, completed, revenue };
  }, [orders]);

  const recent = orders.slice(0, 6);

  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <section className="stats">
        <div className="stat">
          <div className="stat-label">📦 ออเดอร์ทั้งหมด</div>
          <div className="stat-value">{loading ? '…' : s.total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">⏳ กำลังดำเนินการ</div>
          <div className="stat-value">{loading ? '…' : s.active}</div>
        </div>
        <div className="stat">
          <div className="stat-label">✅ ส่งสำเร็จ</div>
          <div className="stat-value">{loading ? '…' : s.completed}</div>
        </div>
        <div className="stat">
          <div className="stat-label">💰 ยอดขาย (ไม่รวมยกเลิก)</div>
          <div className="stat-value accent">{loading ? '…' : baht(s.revenue)}</div>
        </div>
      </section>

      <div className="section-head">
        <h2>ออเดอร์ล่าสุด</h2>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ออเดอร์</th>
                <th>ยอด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td className="time">
                    {new Date(o.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="oid">#{o.id.slice(0, 8)}</td>
                  <td className="total">{baht(o.total)}</td>
                  <td><span className={`pill ${o.status}`}>{STATUS_TH[o.status] || o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && recent.length === 0 && (
          <div className="state"><span className="emoji">📭</span> ยังไม่มีออเดอร์</div>
        )}
        {loading && <div className="state"><span className="spinner" /> กำลังโหลด…</div>}
      </div>
    </>
  );
}
