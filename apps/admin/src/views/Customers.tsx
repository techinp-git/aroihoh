import { useEffect, useState, useCallback } from 'react';
import {
  listCustomers,
  getCustomer,
  baht,
  STATUS_TH,
  type CustomerRow,
  type CustomerDetail,
} from '../api';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export default function Customers({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      setRows(await listCustomers(brandId, q.trim() || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId, q]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      setDetail(await getCustomer(brandId, id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  if (detail) {
    return (
      <>
        <div className="section-head">
          <button className="btn ghost sm" onClick={() => setDetail(null)}>← กลับ</button>
        </div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div className="logo" style={{ width: 48, height: 48, fontSize: 24 }}>🙂</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.displayName || '(ไม่มีชื่อ)'}</div>
              <div className="pay">LINE: {detail.lineUserId}</div>
            </div>
          </div>
          <div className="stats" style={{ marginTop: 18, gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="stat"><div className="stat-label">ออเดอร์ทั้งหมด</div><div className="stat-value">{detail.orderCount}</div></div>
            <div className="stat"><div className="stat-label">ยอดใช้จ่ายรวม</div><div className="stat-value accent">{baht(detail.totalSpent)}</div></div>
            <div className="stat"><div className="stat-label">สั่งล่าสุด</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtDate(detail.lastOrderAt)}</div></div>
          </div>
        </div>

        {detail.addresses.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>ที่อยู่จัดส่ง</div>
            {detail.addresses.map((a) => (
              <div key={a.id} style={{ fontSize: 13, marginBottom: 4 }}>
                📍 {a.label ? `${a.label}: ` : ''}{a.detail}
              </div>
            ))}
          </div>
        )}

        <div className="section-head"><h2>ประวัติออเดอร์</h2></div>
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>วันที่</th><th>ออเดอร์</th><th>ยอด</th><th>สถานะ</th></tr></thead>
              <tbody>
                {detail.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="time">{new Date(o.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</td>
                    <td className="oid">#{o.id.slice(0, 8)}</td>
                    <td className="total">{baht(o.total)}</td>
                    <td><span className={`pill ${o.status}`}>{STATUS_TH[o.status] || o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.orders.length === 0 && <div className="state">ยังไม่มีออเดอร์</div>}
        </div>
      </>
    );
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="section-head">
        <h2>ลูกค้าทั้งหมด ({rows.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="ค้นหาชื่อ…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn ghost sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '🔍'} ค้นหา
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>ลูกค้า</th><th>ออเดอร์</th><th>ยอดใช้จ่าย</th><th>สั่งล่าสุด</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => open(c.id)}>
                  <td style={{ fontWeight: 600 }}>{c.displayName || '(ไม่มีชื่อ)'}</td>
                  <td>{c.orderCount}</td>
                  <td className="total">{baht(c.totalSpent)}</td>
                  <td className="time">{fmtDate(c.lastOrderAt)}</td>
                  <td><button className="btn ghost sm">ดู →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="state"><span className="emoji">👤</span> ยังไม่มีลูกค้า</div>
        )}
        {(loading || detailLoading) && <div className="state"><span className="spinner" /> กำลังโหลด…</div>}
      </div>
    </>
  );
}
