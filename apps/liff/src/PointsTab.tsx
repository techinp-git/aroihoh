import type { LoyaltyMe, LoyaltyTx } from './api';

/**
 * US-52: แท็บ "แต้ม" — ยอดแต้ม + ความคืบหน้าไปรางวัลถัดไป + ประวัติ
 * การเลือกรางวัล/ออกคูปอง QR เป็นของ US-53
 */

const TX_LABEL: Record<LoyaltyTx['type'], string> = {
  earn: 'สแกนรับแต้ม',
  redeem: 'แลกรางวัล',
  adjust: 'ปรับแต้มโดยร้าน',
  expire: 'แต้มหมดอายุ',
};

const thaiDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export function EarnResultView({
  result,
  onSeePoints,
  onOrder,
}: {
  result: EarnOutcome;
  onSeePoints: () => void;
  onOrder: () => void;
}) {
  const ok = result.kind === 'ok';
  return (
    <>
      <div className="done-hero">
        <div className="emoji">{ok ? '🎯' : result.kind === 'used' ? '🙃' : '😕'}</div>
        {ok ? (
          <>
            <div className="earn-plus">+{result.earned}</div>
            <h2 style={{ margin: '4px 0 0' }}>ได้แต้มแล้ว!</h2>
          </>
        ) : (
          <h2>{result.title}</h2>
        )}
      </div>

      <div className="card">
        {ok ? (
          <>
            <div className="line total" style={{ border: 0, marginTop: 0, paddingTop: 0 }}>
              <span>แต้มสะสมทั้งหมด</span>
              <span>{result.balance.toLocaleString('th-TH')}</span>
            </div>
            {result.nextText && <div className="desc">{result.nextText}</div>}
          </>
        ) : (
          <div className="desc" style={{ lineHeight: 1.6 }}>{result.detail}</div>
        )}
      </div>

      <button className="btn primary" onClick={onSeePoints}>ดูแต้มของฉัน</button>
      <button className="btn ghost" onClick={onOrder} style={{ marginTop: 10 }}>สั่งอาหาร</button>
    </>
  );
}

/** ผลของการสแกน — แยกเคสไว้ให้ชัด เพราะข้อความที่ลูกค้าควรเห็นต่างกันมาก */
export type EarnOutcome =
  | { kind: 'ok'; earned: number; balance: number; nextText?: string }
  | { kind: 'used' | 'invalid' | 'error'; title: string; detail: string };

export default function PointsTab({ data }: { data: LoyaltyMe }) {
  const next = data.nextReward;
  const need = next ? Math.max(0, next.pointsCost - data.balance) : 0;
  const pct = next && next.pointsCost > 0
    ? Math.min(100, Math.round((data.balance / next.pointsCost) * 100))
    : 0;

  return (
    <>
      <div className="card points-hero">
        <div className="points-label">แต้มสะสม</div>
        <div className="points-big">{data.balance.toLocaleString('th-TH')}</div>
        {next ? (
          <>
            <div className="progress"><i style={{ width: `${pct}%` }} /></div>
            <div className="desc">
              {need === 0
                ? `แลก ${next.name} ได้แล้ว`
                : `อีก ${need} แต้ม แลก ${next.name}`}
            </div>
          </>
        ) : (
          <div className="desc">ร้านยังไม่ได้ตั้งของรางวัล</div>
        )}
      </div>

      {data.pending && (
        <div className="card">
          <h3>คูปองที่รออยู่</h3>
          <div className="line" style={{ padding: '2px 0' }}>
            <span>{data.pending.rewardName}</span>
            <span>{data.pending.pointsCost} แต้ม</span>
          </div>
          <div className="desc">ยื่นให้พนักงานสแกน · รหัส {data.pending.code}</div>
        </div>
      )}

      <div className="card">
        <h3>ประวัติแต้ม</h3>
        {data.history.length === 0 && (
          <div className="empty">ยังไม่มีรายการ — สแกน QR ใต้ฝากล่องเพื่อรับแต้มแรก</div>
        )}
        {data.history.map((h) => (
          <div key={h.id} className="tx-row">
            <div>
              <div className="tx-label">{h.note || TX_LABEL[h.type]}</div>
              <div className="tx-time">{thaiDateTime(h.createdAt)}</div>
            </div>
            <div className={'tx-points' + (h.points < 0 ? ' minus' : '')}>
              {h.points > 0 ? `+${h.points}` : h.points}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
