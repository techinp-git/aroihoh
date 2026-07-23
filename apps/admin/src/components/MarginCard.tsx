import { useState } from 'react';
import { baht, setFixedCost, type MarginReport } from '../api';

/**
 * US-19 — การ์ดมาร์จิ้น/กล่อง + จุดคุ้มทุนรายวัน
 *
 * หลักสำคัญ: ถ้าข้อมูลต้นทุนไม่ครบ ต้อง "บอกตรง ๆ ว่าเชื่อไม่ได้" ไม่ใช่โชว์ตัวเลขสวย ๆ
 * เพราะเลขพวกนี้เอาไปใช้ตัดสินใจเจรจาราคาโอนกับครัว (ทุก 1฿ = กำไร +30,000/เดือน)
 */
export default function MarginCard({
  data,
  brandId,
  onSaved,
}: {
  data: MarginReport;
  brandId: string;
  onSaved: () => void;
}) {
  const { summary: s, breakeven: b } = data;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(data.fixedCostDaily != null ? (data.fixedCostDaily / 100).toString() : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const n = val.trim() === '' ? null : Number(val);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setErr('ตัวเลขไม่ถูกต้อง');
    setBusy(true);
    setErr('');
    try {
      await setFixedCost(brandId, n === null ? null : Math.round(n * 100));
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const incomplete = s.costCoverage < 100;

  return (
    <>
      <div className="section-head">
        <h2>มาร์จิ้น &amp; จุดคุ้มทุน</h2>
        <button className="btn ghost sm" onClick={() => setEditing((e) => !e)}>
          {editing ? 'ปิด' : '⚙️ ค่าใช้จ่ายคงที่/วัน'}
        </button>
      </div>

      {editing && (
        <div className="card" style={{ padding: 16, marginBottom: 12, display: 'grid', gap: 10, maxWidth: 420 }}>
          <label className="field">
            <span>ค่าใช้จ่ายคงที่ต่อวัน (บาท)</span>
            <input
              type="number"
              min="0"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="เช่น 3900"
            />
          </label>
          <div style={{ fontSize: 12, color: '#868e96' }}>
            ค่าเช่า + ค่าคน + การตลาด เฉลี่ยต่อวัน — ใช้หาว่าต้องขายกี่กล่องถึงเท่าทุน · เว้นว่าง = ไม่คำนวณ
          </div>
          {err && <div style={{ color: '#c92a2a', fontSize: 13 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy} onClick={save}>บันทึก</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button>
          </div>
        </div>
      )}

      {incomplete && (
        <div
          className="card"
          style={{ padding: 12, marginBottom: 12, background: '#fff9db', border: '1px solid #ffe066', fontSize: 13 }}
        >
          ⚠️ ต้นทุนครบ {s.costCoverage}% ({s.boxesMissingCost} กล่องยังไม่มีข้อมูลต้นทุน) — ตัวเลขกำไรด้านล่างยังเชื่อไม่ได้เต็มที่
          ไปกรอกต้นทุนที่หน้า <strong>เมนู</strong> ก่อนเอาไปตัดสินใจเรื่องราคา
        </div>
      )}

      <section className="stats">
        <div className="stat">
          <div className="stat-label">📦 ขายได้</div>
          <div className="stat-value">{s.boxes} กล่อง</div>
        </div>
        <div className="stat">
          <div className="stat-label">💵 กำไรขั้นต้น</div>
          <div className="stat-value accent">{baht(s.grossProfit)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">📊 มาร์จิ้น</div>
          <div className="stat-value">{s.marginPct}%</div>
        </div>
        <div className="stat">
          <div className="stat-label">🍱 กำไร/กล่อง</div>
          <div className="stat-value">{baht(s.contributionPerBox)}</div>
        </div>
      </section>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {b.boxesPerDay === null ? (
          <div style={{ color: '#868e96', fontSize: 14 }}>
            ยังคำนวณจุดคุ้มทุนไม่ได้ — {b.reason}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15 }}>
                จุดคุ้มทุน <strong>{b.boxesPerDay} กล่อง/วัน</strong>
                <span style={{ color: '#868e96' }}> (≈ {baht(b.revenuePerDay ?? 0)})</span>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color: b.reached ? '#2b8a3e' : '#c92a2a',
                }}
              >
                {b.reached ? `✅ ถึงแล้ว เกินมา ${b.gap} กล่อง` : `ยังขาดอีก ${Math.abs(b.gap ?? 0)} กล่อง`}
              </div>
            </div>
            {/* แถบความคืบหน้าเทียบจุดคุ้มทุน */}
            <div style={{ height: 8, background: '#f1f3f5', borderRadius: 4, overflow: 'hidden', margin: '10px 0' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.round((s.boxes / b.boxesPerDay) * 100))}%`,
                  height: '100%',
                  background: b.reached ? '#40c057' : '#fa5252',
                  transition: 'width .3s',
                }}
              />
            </div>
            <div style={{ fontSize: 13, color: '#495057' }}>
              กำไรสุทธิโดยประมาณวันนี้{' '}
              <strong style={{ color: (b.netProfit ?? 0) >= 0 ? '#2b8a3e' : '#c92a2a' }}>
                {baht(b.netProfit ?? 0)}
              </strong>
              <span style={{ color: '#868e96' }}> (หักค่าใช้จ่ายคงที่ {baht(data.fixedCostDaily ?? 0)} แล้ว)</span>
            </div>
          </>
        )}
      </div>

      {data.byMenu.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>เมนู</th>
                  <th>ขาย</th>
                  <th>ยอดขาย</th>
                  <th>ต้นทุน</th>
                  <th>กำไร</th>
                  <th>มาร์จิ้น</th>
                </tr>
              </thead>
              <tbody>
                {data.byMenu.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.qty}</td>
                    <td className="total">{baht(m.revenue)}</td>
                    <td>{m.hasCost ? baht(m.cost) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                    <td className="total">{m.hasCost ? baht(m.profit) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                    <td style={{ color: !m.hasCost ? '#adb5bd' : m.marginPct < 30 ? '#c92a2a' : '#2b8a3e' }}>
                      {m.hasCost ? `${m.marginPct}%` : 'ยังไม่กรอกต้นทุน'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
