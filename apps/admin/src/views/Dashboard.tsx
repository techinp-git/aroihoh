import { useEffect, useState } from 'react';
import {
  listOrders,
  dailyReport,
  merchantDailyReport,
  baht,
  STATUS_TH,
  ACTIVE_STATUSES,
  type Order,
  type DailyReport,
  type MerchantDaily,
} from '../api';
import BrandChip from '../components/BrandChip';

// วันที่วันนี้ตามเขตกรุงเทพ (YYYY-MM-DD) สำหรับ default + ค่าสูงสุดของ date picker
const todayBangkok = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export default function Dashboard({ brandId }: { brandId: string }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [merchant, setMerchant] = useState<MerchantDaily | null>(null);
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

  // US-38: สรุปรวมทุกแบรนด์ (แสดงเมื่อมี >1 แบรนด์ที่มีออเดอร์วันนั้น)
  useEffect(() => {
    let alive = true;
    merchantDailyReport(date)
      .then((m) => alive && setMerchant(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);

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

      {/* US-38: สรุปรวมทุกแบรนด์ (merchant) — โชว์เมื่อมี >1 แบรนด์ที่มีออเดอร์ */}
      {merchant && merchant.brands.length > 1 && (
        <>
          <div className="section-head">
            <h2>รวมทุกแบรนด์ ({merchant.brands.length}) — {baht(merchant.total.revenue)} · {merchant.total.count} ออเดอร์</h2>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>แบรนด์</th><th>ออเดอร์</th><th>ส่งสำเร็จ</th><th>ยกเลิก</th><th>ยอดขาย</th></tr>
                </thead>
                <tbody>
                  {merchant.brands.map((b) => (
                    <tr key={b.brandId}>
                      <td><BrandChip name={b.brandName} /></td>
                      <td>{b.count}</td>
                      <td>{b.completed}</td>
                      <td>{b.cancelled}</td>
                      <td className="total">{baht(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>ออเดอร์ล่าสุด (แบรนด์ที่เลือก)</h2>
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
