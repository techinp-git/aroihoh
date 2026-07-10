import { useEffect, useState, useCallback } from 'react';
import {
  listBroadcasts,
  previewBroadcast,
  createBroadcast,
  listCustomers,
  type Broadcast as BC,
  type BroadcastPreview,
} from '../api';

const STATUS_TH: Record<string, string> = {
  draft: 'ร่าง', queued: 'เข้าคิว', sending: 'กำลังส่ง', sent: 'ส่งแล้ว', failed: 'ล้มเหลว',
};

export default function Broadcast({ brandId }: { brandId: string }) {
  const [message, setMessage] = useState('');
  const [tags, setTags] = useState<string[]>([]); // segment ที่เลือก
  const [allTags, setAllTags] = useState<string[]>([]);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [history, setHistory] = useState<BC[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const segment = tags.length ? { tags } : undefined;

  const loadHistory = useCallback(async () => {
    if (!brandId) return;
    try {
      setHistory(await listBroadcasts(brandId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brandId]);

  // ดึงแท็กที่มีจากรายชื่อลูกค้า (ไว้เลือก segment)
  const loadTags = useCallback(async () => {
    if (!brandId) return;
    try {
      const cs = await listCustomers(brandId);
      setAllTags([...new Set(cs.flatMap((c) => c.tags))].sort());
    } catch {
      /* ไม่เป็นไร */
    }
  }, [brandId]);

  useEffect(() => {
    loadHistory();
    loadTags();
  }, [loadHistory, loadTags]);

  // ประเมิน reach ทุกครั้งที่ segment เปลี่ยน
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    previewBroadcast(brandId, segment)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, tags.join(',')]);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const send = async () => {
    const msg = message.trim();
    if (!msg) return setError('พิมพ์ข้อความก่อน');
    if (!window.confirm(`ส่งถึง ${preview?.audienceCount ?? '?'} คน?\n(ข้าม opt-out ${preview?.optedOut ?? 0} คนอัตโนมัติ)`)) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      const bc = await createBroadcast(brandId, msg, segment);
      setOk(`เข้าคิวส่งถึง ${bc.audienceCount} คนแล้ว — จะยิงเข้า LINE เมื่อเชื่อม SETUP-1`);
      setMessage('');
      await loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)', maxWidth: 900 }}>
      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert" style={{ background: 'var(--st-completed-bg)', color: 'var(--st-completed)', border: '1px solid #bbf7d0' }}>✅ {ok}</div>}

      {/* composer */}
      <div className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>ส่งข่าวสาร (Broadcast)</h2>

        <label className="field">
          <span>ข้อความ</span>
          <textarea
            rows={4}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="เช่น 🔥 วันนี้ลด 10% ทุกเมนู สั่งเลย!"
            style={{ resize: 'vertical', font: 'inherit', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'right' }}>{message.length}/1000</span>
        </label>

        <div className="field">
          <span>กลุ่มเป้าหมาย (ไม่เลือก = ลูกค้าทั้งหมดที่ไม่ opt-out)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {allTags.length === 0 && <span className="pay">ยังไม่มีแท็กลูกค้า — จะส่งถึงทุกคน</span>}
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                className={`pill ${tags.includes(t) ? 'on' : 'off'}`}
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => toggleTag(t)}
              >
                {tags.includes(t) ? '✓ ' : ''}{t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="stat" style={{ padding: '10px 16px', margin: 0 }}>
            <div className="stat-label">📣 ผู้รับโดยประมาณ</div>
            <div className="stat-value accent" style={{ fontSize: 24 }}>{preview?.audienceCount ?? '…'}</div>
          </div>
          <div className="pay">
            ลูกค้าทั้งหมด {preview?.totalCustomers ?? '…'} · ข้าม opt-out {preview?.optedOut ?? 0} คน (PDPA)
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn primary" disabled={busy || !message.trim() || !(preview?.audienceCount)} onClick={send}>
            {busy ? <span className="spinner" /> : '📨'} ส่ง Broadcast
          </button>
        </div>
        <div className="pay" style={{ fontSize: 12 }}>
          ⚠️ การยิงเข้า LINE จริงรอเชื่อม LINE OA (SETUP-1) — ตอนนี้ระบบจะจองคิว + กันส่งซ้ำไว้ให้
        </div>
      </div>

      {/* history */}
      <div>
        <div className="section-head"><h2>ประวัติการส่ง ({history.length})</h2></div>
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>เวลา</th><th>ข้อความ</th><th>กลุ่ม</th><th>ผู้รับ</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="time">{new Date(b.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ maxWidth: 320 }}>{b.message}</td>
                    <td>{b.segment?.tags?.length ? b.segment.tags.join(', ') : 'ทั้งหมด'}</td>
                    <td className="total">{b.audienceCount}</td>
                    <td><span className={`pill ${b.status === 'sent' ? 'on' : 'off'}`}>{STATUS_TH[b.status] || b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && <div className="state"><span className="emoji">📣</span> ยังไม่เคยส่ง Broadcast</div>}
        </div>
      </div>
    </div>
  );
}
