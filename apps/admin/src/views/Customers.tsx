import { useEffect, useState, useCallback } from 'react';
import {
  listCustomers,
  listTagCounts,
  getCustomer,
  updateCustomerTags,
  baht,
  STATUS_TH,
  type CustomerRow,
  type CustomerDetail,
  type TagCount,
} from '../api';
import { TagEditor } from '../components/Tags';
import { Avatar, nameHue } from '../components/Avatar';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// นับแท็กจากลิสต์ในมือ (ให้ตัวกรองอัปเดตทันทีหลังแก้แท็ก โดยไม่ต้องโหลดใหม่)
const recount = (rows: CustomerRow[]): TagCount[] => {
  const m = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
};

// ป้ายแท็กเล็ก ๆ สีตามชื่อแท็ก (เหมือนกันทุกที่)
function TagPill({ tag }: { tag: string }) {
  const hue = nameHue(tag);
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '1px 8px',
        borderRadius: 999, background: `hsl(${hue} 70% 93%)`, color: `hsl(${hue} 55% 32%)`,
        border: `1px solid hsl(${hue} 55% 80%)`, whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  );
}

export default function Customers({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [filterTag, setFilterTag] = useState(''); // '' = ทุกคน

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      const [r, t] = await Promise.all([
        listCustomers(brandId, q.trim() || undefined),
        listTagCounts(brandId).catch(() => []),
      ]);
      setRows(r);
      setTagCounts(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId, q]);

  useEffect(() => {
    load();
  }, [load]);

  // กรองตามแท็กฝั่ง client (ลิสต์โหลดมาครบแล้ว — ไม่ต้องยิง server ซ้ำตอนสลับแท็บแท็ก)
  const shown = filterTag ? rows.filter((c) => c.tags.includes(filterTag)) : rows;

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

  const saveTags = async (tags: string[]) => {
    if (!detail) return;
    try {
      await updateCustomerTags(brandId, detail.id, tags);
      setDetail({ ...detail, tags });
      // อัปเดตลิสต์+ตัวนับแท็กในหน่วยความจำ ให้ตรงตอนกดกลับ (ไม่ต้องยิง server ซ้ำ)
      setRows((rs) => rs.map((r) => (r.id === detail.id ? { ...r, tags } : r)));
      setTagCounts(recount(rows.map((r) => (r.id === detail.id ? { ...r, tags } : r))));
    } catch (e) {
      setError((e as Error).message);
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
          <div style={{ marginTop: 14 }}>
            <div className="stat-label" style={{ marginBottom: 6 }}>แท็ก</div>
            <TagEditor tags={detail.tags} onChange={saveTags} />
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
        <h2>ลูกค้าทั้งหมด ({shown.length}{filterTag && ` / ${rows.length}`})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="ค้นหาชื่อ…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()} />
          <button className="btn ghost sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '🔍'} ค้นหา
          </button>
        </div>
      </div>

      {/* ตัวกรองตามแท็ก — คลิกเลือกแท็กเพื่อดูเฉพาะลูกค้ากลุ่มนั้น */}
      {tagCounts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <span className="pay" style={{ fontSize: 12 }}>กรองแท็ก:</span>
          <button
            className="btn ghost sm"
            style={filterTag === '' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            onClick={() => setFilterTag('')}
          >
            ทั้งหมด
          </button>
          {tagCounts.map((t) => (
            <button
              key={t.tag}
              onClick={() => setFilterTag((cur) => (cur === t.tag ? '' : t.tag))}
              style={{
                cursor: 'pointer', border: 'none', background: 'transparent', padding: 0,
                opacity: filterTag && filterTag !== t.tag ? 0.45 : 1,
                outline: filterTag === t.tag ? '2px solid var(--accent)' : 'none',
                borderRadius: 999,
              }}
            >
              <TagPill tag={`${t.tag} · ${t.count}`} />
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>ลูกค้า</th><th>แท็ก</th><th>ออเดอร์</th><th>ยอดใช้จ่าย</th><th>สั่งล่าสุด</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => open(c.id)}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Avatar name={c.displayName} url={c.pictureUrl} size={32} />
                      <span style={{ fontWeight: 600 }}>
                        {c.displayName || '(ไม่มีชื่อ)'}
                        {c.marketingOptedOut && (
                          <span className="pay" style={{ fontSize: 11, marginLeft: 6 }}>🚫 ไม่รับข่าว</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                      {c.tags.length === 0
                        ? <span className="pay" style={{ fontSize: 12 }}>—</span>
                        : c.tags.map((t) => <TagPill key={t} tag={t} />)}
                    </div>
                  </td>
                  <td>{c.orderCount}</td>
                  <td className="total">{baht(c.totalSpent)}</td>
                  <td className="time">{fmtDate(c.lastOrderAt)}</td>
                  <td><button className="btn ghost sm">ดู →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && shown.length === 0 && (
          <div className="state">
            <span className="emoji">👤</span> {filterTag ? `ไม่มีลูกค้าที่มีแท็ก "${filterTag}"` : 'ยังไม่มีลูกค้า'}
          </div>
        )}
        {(loading || detailLoading) && <div className="state"><span className="spinner" /> กำลังโหลด…</div>}
      </div>
    </>
  );
}
