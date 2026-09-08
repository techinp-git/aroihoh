import { useEffect, useState } from 'react';
import { baht, getRewards, type LoyaltyMe, type LoyaltyTx, type Reward } from './api';

/**
 * US-52: แท็บ "แต้ม" — ยอดแต้ม + ความคืบหน้าไปรางวัลถัดไป + ประวัติ
 * US-53: + รายการของรางวัล กดแลกแล้วได้คูปอง QR
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

export default function PointsTab({
  data,
  onRedeem,
  onOpenPending,
}: {
  data: LoyaltyMe;
  onRedeem: (rewardId: string) => Promise<void>;
  onOpenPending: () => void;
}) {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    getRewards().then((r) => setRewards(r.rewards)).catch(() => setRewards([]));
  }, [data.balance]);

  const redeem = async (r: Reward) => {
    if (!confirm(`ใช้ ${r.pointsCost} แต้ม แลก ${r.name}?`)) return;
    setBusyId(r.id);
    try {
      await onRedeem(r.id);
    } finally {
      setBusyId('');
    }
  };

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
        <button className="card pending-card" onClick={onOpenPending}>
          <div>
            <div className="tx-label">🎟️ คูปองที่รออยู่: {data.pending.rewardName}</div>
            <div className="desc">แตะเพื่อเปิด QR ให้พนักงานสแกน</div>
          </div>
          <span className="addr-go">›</span>
        </button>
      )}

      <div className="card">
        <h3>ของรางวัล</h3>
        {rewards === null && <div className="empty">กำลังโหลด…</div>}
        {rewards?.length === 0 && <div className="empty">ร้านยังไม่ได้ตั้งของรางวัล</div>}
        {rewards?.map((r) => (
          <div key={r.id} className="reward-row">
            <div className="addr-main">
              <span className="addr-label">{r.name}</span>
              {r.description && <span className="addr-detail">{r.description}</span>}
              {r.type === 'discount' && r.discountAmount != null && (
                <span className="addr-detail">ส่วนลด {baht(r.discountAmount)}</span>
              )}
            </div>
            <button
              className={'btn ' + (r.affordable ? 'primary' : 'ghost')}
              disabled={!r.affordable || !!busyId || !!data.pending}
              onClick={() => redeem(r)}
            >
              {busyId === r.id
                ? <div className="spinner" />
                : r.affordable
                  ? `แลก · ${r.pointsCost}`
                  : `อีก ${r.pointsCost - data.balance} แต้ม`}
            </button>
          </div>
        ))}
        {data.pending && rewards && rewards.length > 0 && (
          <div className="desc">มีคูปองค้างอยู่ 1 ใบ — ใช้หรือยกเลิกก่อนถึงแลกใบใหม่ได้</div>
        )}
      </div>

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
