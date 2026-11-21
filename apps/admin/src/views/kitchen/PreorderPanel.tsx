import { useCallback, useEffect, useState } from 'react';
import {
  getProductionSummary,
  baht,
  type ProductionSummary,
  type ProductionGroup,
} from '../../api';
import BrandChip from '../../components/BrandChip';
import { printHtml, productionSheetHtml } from '../../lib/print';

/** วันไทยแบบ YYYY-MM-DD (ห้ามใช้วัน UTC — รอบวันจะตัดตอนบ่ายโมงบ้านเรา) */
function bangkokDateKey(at: Date): string {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayTH = (key: string) =>
  new Date(`${key}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * US-22: ใบสรุปยอดผลิตของรอบส่งล่วงหน้า
 *
 * ตัวเลขที่ครัว/เจ้าของใช้ตัดสินใจจริง: กี่กล่องต่อรอบ (ผลิตเท่าไร) และ
 * กี่กล่องต่อ "จุดส่ง" (รวมรอบรถคุ้มหรือยัง — ค่าส่งเดี่ยวหนึ่งจุดแพงกว่ากำไรต่อกล่อง)
 */
export default function PreorderPanel() {
  const [date, setDate] = useState(() => bangkokDateKey(new Date(Date.now() + 86400000)));
  const [sum, setSum] = useState<ProductionSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDrops, setOpenDrops] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSum(await getProductionSummary(date));
    } catch (e) {
      setError((e as Error).message);
      setSum(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const today = bangkokDateKey(new Date());
  const tomorrow = shiftDay(today, 1);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>🗓️ สั่งล่วงหน้า — ยอดผลิตต่อรอบ</h2>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className={'btn sm' + (date === today ? ' primary' : ' ghost')} onClick={() => setDate(today)}>
            วันนี้
          </button>
          <button
            className={'btn sm' + (date === tomorrow ? ' primary' : ' ghost')}
            onClick={() => setDate(tomorrow)}
          >
            พรุ่งนี้
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ width: 150 }}
          />
          <button className="btn ghost sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : 'โหลดใหม่'}
          </button>
          <button
            className="btn ghost sm"
            disabled={!sum || sum.totals.orderCount === 0}
            onClick={() => sum && printHtml(productionSheetHtml(sum))}
            title="พิมพ์ใบสรุปยอดผลิต 80mm"
          >
            🖨️ พิมพ์ใบสรุป
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {sum && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'baseline',
              marginTop: 10,
              paddingBottom: 10,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <b style={{ fontSize: 15 }}>{dayTH(sum.date)}</b>
            <span>
              <b style={{ fontSize: 20, color: '#e8734a' }}>{sum.totals.boxCount}</b> กล่อง
            </span>
            <span>
              <b style={{ fontSize: 20 }}>{sum.totals.dropCount}</b> จุดส่ง
            </span>
            <span style={{ color: '#888', fontSize: 13 }}>
              {sum.totals.orderCount} ออเดอร์ · {baht(sum.totals.revenue)}
            </span>
            {/* ยอดยังไม่นิ่ง = ห้ามเอาไปสั่งวัตถุดิบ บอกให้ชัดบนจอ ไม่ใช่ให้เดาเอง */}
            <span className={`pill ${sum.final ? 'on' : 'off'}`} style={{ fontSize: 11 }}>
              {sum.final
                ? `ปิดรับแล้ว (${sum.cutoffTime}) · ยอดนิ่ง`
                : `ยังไม่ปิดรับ (ปิด ${sum.cutoffTime ?? '-'}) · ยอดอาจเปลี่ยน`}
            </span>
          </div>

          {sum.totals.orderCount === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
              ยังไม่มีออเดอร์ล่วงหน้าของวันนี้
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
                marginTop: 12,
              }}
            >
              {sum.groups.map((g) => (
                <SlotCard
                  key={g.slotId ?? 'orphan'}
                  group={g}
                  summary={sum}
                  open={!!openDrops[g.slotId ?? 'orphan']}
                  onToggle={() =>
                    setOpenDrops((o) => ({
                      ...o,
                      [g.slotId ?? 'orphan']: !o[g.slotId ?? 'orphan'],
                    }))
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SlotCard({
  group: g,
  summary,
  open,
  onToggle,
}: {
  group: ProductionGroup;
  summary: ProductionSummary;
  open: boolean;
  onToggle: () => void;
}) {
  // bucket "ไม่ตรงรอบ" = ออเดอร์ที่จองไว้ก่อนมีการแก้เวลารอบ — ต้องเด่นให้คนเห็นแล้วไปตรวจ
  const orphan = g.slotId === null;
  return (
    <div
      className="card"
      style={{
        padding: 12,
        borderTop: `4px solid ${orphan ? '#e2544a' : '#1d9e75'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b>
          {orphan ? '⚠️ ' : ''}
          {g.name}
        </b>
        <span style={{ color: '#888', fontSize: 12 }}>
          {g.startTime ? `${g.startTime}–${g.endTime}` : '—'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span>
          <b style={{ fontSize: 18, color: '#e8734a' }}>{g.boxCount}</b> กล่อง
        </span>
        <span>
          <b style={{ fontSize: 18 }}>{g.dropCount}</b> จุด
        </span>
        <span style={{ color: '#888', fontSize: 12 }}>{g.orderCount} ออเดอร์</span>
      </div>

      {g.menuTotals.length === 0 ? (
        <div style={{ color: '#999', fontSize: 13 }}>— ยังไม่มีออเดอร์ —</div>
      ) : (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
          {g.menuTotals.map((m) => (
            <div
              key={m.brandId + m.menuItemId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 14,
                marginBottom: 3,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <BrandChip name={m.brandName} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </span>
              </span>
              <b style={{ color: '#e8734a', whiteSpace: 'nowrap' }}>×{m.qty}</b>
            </div>
          ))}
        </div>
      )}

      {g.drops.length > 0 && (
        <>
          <button className="btn ghost sm" style={{ width: '100%' }} onClick={onToggle}>
            {open ? 'ซ่อนจุดส่ง' : `ดูจุดส่ง (${g.dropCount})`}
          </button>
          {open && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, fontSize: 13 }}>
              {g.drops.map((d) => (
                <div key={d.key} style={{ padding: '5px 0', borderBottom: '1px dotted #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b>{d.boxes} กล่อง</b>
                    <span style={{ color: '#888' }}>
                      {d.orderCount} ออเดอร์{d.codTotal > 0 ? ` · เก็บ ${baht(d.codTotal)}` : ''}
                    </span>
                  </div>
                  <div style={{ color: '#666' }}>{d.detail}</div>
                </div>
              ))}
            </div>
          )}
          <button
            className="btn ghost sm"
            style={{ width: '100%' }}
            onClick={() => printHtml(productionSheetHtml(summary, { slotId: g.slotId }))}
            disabled={g.orderCount === 0}
          >
            🖨️ พิมพ์เฉพาะรอบนี้
          </button>
        </>
      )}
    </div>
  );
}
