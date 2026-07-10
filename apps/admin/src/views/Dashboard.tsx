import { useEffect, useState } from 'react';
import {
  listOrders,
  dailyReport,
  baht,
  STATUS_TH,
  ACTIVE_STATUSES,
  type Order,
  type DailyReport,
} from '../api';

// วันที่วันนี้ตามเขตกรุงเทพ (YYYY-MM-DD) สำหรับ default + ค่าสูงสุดของ date picker
const todayBangkok = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export default function Dashboard({ brandId }: { brandId: string }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayBangkok());
  const isToday = date === todayBangkok();

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([dailyReport(brandId, date), listOrders(brandId)])
      .then(([rep, orders]) => {
        if (!alive) return;
        setReport(rep);
        setRecent(orders.slice(0, 6));
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [brandId, date]);

  const active = report
    ? Object.entries(report.byStatus)
        .filter(([s]) => ACTIVE_STATUSES.has(s))
        .reduce((a, [, n]) => a + n, 0)
    : 0;

  if (error) return <div className="alert error">{error}</div>;
  const v = (n: number | string) => (loading ? '…' : n);

  return (
    <>
      <div className="count-line" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>{isToday ? 'สรุปยอดวันนี้' : 'สรุปยอดวันที่'} ({report?.date || '—'})</span>
        <span style={{ flex: 1 }} />
        <input
          type="date"
          value={date}
          max={todayBangkok()}
          onChange={(e) => setDate(e.target.value || todayBangkok())}
        />
        {!isToday && (
          <button className="btn ghost sm" onClick={() => setDate(todayBangkok())}>วันนี้</button>
        )}
      </div>
      <section className="stats">
        <div className="stat">
          <div className="stat-label">📦 ออเดอร์{isToday ? 'วันนี้' : ''}</div>
          <div className="stat-value">{v(report?.count ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">⏳ กำลังดำเนินการ</div>
          <div className="stat-value">{v(active)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">✅ ส่งสำเร็จ</div>
          <div className="stat-value">{v(report?.completed ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">💰 ยอดขาย (ไม่รวมยกเลิก)</div>
          <div className="stat-value accent">{v(baht(report?.revenue ?? 0))}</div>
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
