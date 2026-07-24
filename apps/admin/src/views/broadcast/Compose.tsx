import { useEffect, useState, useCallback } from 'react';
import {
  listContent, listAudiences, listBroadcasts, previewBroadcast, createBroadcast, dispatchBroadcast,
  type Content, type Audience, type Broadcast,
} from '../../api';

const STATUS_TH: Record<string, string> = { draft: 'ร่าง', queued: 'เข้าคิว', sending: 'กำลังส่ง', sent: 'ส่งแล้ว', failed: 'ล้มเหลว' };

export default function Compose({ brandId }: { brandId: string }) {
  const [contents, setContents] = useState<Content[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [history, setHistory] = useState<Broadcast[]>([]);

  const [contentId, setContentId] = useState('');   // '' = พิมพ์สด
  const [customMsg, setCustomMsg] = useState('');
  const [audienceId, setAudienceId] = useState(''); // '' = ลูกค้าทั้งหมด
  const [reach, setReach] = useState<{ audienceCount: number; optedOut: number; totalCustomers: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const [c, a, h] = await Promise.all([listContent(brandId), listAudiences(brandId), listBroadcasts(brandId)]);
      setContents(c); setAudiences(a); setHistory(h);
    } catch (e) { setError((e as Error).message); }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  // reach ตาม audience ที่เลือก
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    previewBroadcast(brandId, audienceId ? { audienceId } : {})
      .then((p) => alive && setReach(p)).catch(() => alive && setReach(null));
    return () => { alive = false; };
  }, [brandId, audienceId]);

  const message = contentId ? (contents.find((c) => c.id === contentId)?.body ?? '') : customMsg;

  const send = async () => {
    if (!message.trim()) return setError('เลือกข้อความจากคลัง หรือพิมพ์เอง');
    const audName = audienceId ? audiences.find((a) => a.id === audienceId)?.name : 'ลูกค้าทั้งหมด';
    if (!window.confirm(`ส่งถึงกลุ่ม "${audName}" ~${reach?.audienceCount ?? '?'} คน?\n(ข้าม opt-out ${reach?.optedOut ?? 0} คน)`)) return;
    setBusy(true); setError(''); setOk('');
    try {
      const bc = await createBroadcast(brandId, {
        ...(contentId ? { contentId } : { message: customMsg.trim() }),
        ...(audienceId ? { audienceId } : {}),
      });
      setCustomMsg(''); setContentId('');

      if (bc.audienceCount === 0) {
        setOk('ไม่มีผู้รับที่เข้าเกณฑ์ (อาจถูก opt-out ทั้งหมด) — ไม่ได้ส่งอะไรออกไป');
        await load();
        return;
      }

      // ยิงต่อทันที — กด "ส่ง" แล้วต้องส่งจริง ไม่ใช่แค่เข้าคิวรอคนมากดซ้ำ
      // แถวใน message_logs จองไว้แล้ว ถ้าหลุดกลางคัน กด "ส่งจริง" ซ้ำได้ dedupeKey กันส่งซ้ำให้
      setOk(`เข้าคิว ${bc.audienceCount} คน — กำลังยิงเข้า LINE…`);
      const r = await dispatchBroadcast(brandId, bc.id);
      setOk(
        r.skipped
          ? `เข้าคิว ${bc.audienceCount} คนแล้ว แต่แบรนด์นี้ยังไม่ได้เชื่อม LINE — กด "ส่งจริง" อีกครั้งหลังเชื่อมแล้ว`
          : `ส่งเข้า LINE แล้ว ${r.dispatched} คน${r.failed ? ` · ล้มเหลว ${r.failed} (กด "ส่งจริง" เพื่อลองใหม่)` : ''}`,
      );
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const dispatch = async (b: Broadcast) => {
    setBusy(true); setError(''); setOk('');
    try {
      const r = await dispatchBroadcast(brandId, b.id);
      setOk(r.skipped ? 'ยังไม่ได้เชื่อม LINE (SETUP-1) — ยิงจริงไม่ได้ ข้อความยังค้างคิวไว้' : `ส่งจริงสำเร็จ ${r.dispatched} คน${r.failed ? ` · ล้มเหลว ${r.failed}` : ''}`);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 780 }}>
      {error && <div className="alert error">{error}</div>}
      {ok && <div className="alert" style={{ background: 'var(--st-completed-bg)', color: 'var(--st-completed)', border: '1px solid #bbf7d0' }}>✅ {ok}</div>}

      <div className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <label className="field">
          <span>ข้อความ</span>
          <select value={contentId} onChange={(e) => setContentId(e.target.value)}>
            <option value="">— พิมพ์เอง —</option>
            {contents.map((c) => <option key={c.id} value={c.id}>📄 {c.title}</option>)}
          </select>
        </label>
        {contentId ? (
          <div className="card" style={{ padding: 12, background: 'var(--surface-2)', whiteSpace: 'pre-wrap' }}>{message}</div>
        ) : (
          <textarea rows={3} value={customMsg} maxLength={1000} onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="พิมพ์ข้อความ… หรือเลือกจากคลังด้านบน"
            style={{ resize: 'vertical', font: 'inherit', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }} />
        )}

        <label className="field">
          <span>กลุ่มเป้าหมาย</span>
          <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
            <option value="">👥 ลูกค้าทั้งหมด (ที่ไม่ opt-out)</option>
            {audiences.map((a) => <option key={a.id} value={a.id}>🎯 {a.name}</option>)}
          </select>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="stat" style={{ padding: '10px 16px', margin: 0 }}>
            <div className="stat-label">📣 ผู้รับโดยประมาณ</div>
            <div className="stat-value accent" style={{ fontSize: 24 }}>{reach?.audienceCount ?? '…'}</div>
          </div>
          <div className="pay">ลูกค้าทั้งหมด {reach?.totalCustomers ?? '…'} · ข้าม opt-out {reach?.optedOut ?? 0} คน (PDPA)</div>
          <span style={{ flex: 1 }} />
          <button className="btn primary" disabled={busy || !message.trim() || !reach?.audienceCount} onClick={send}>
            {busy ? <span className="spinner" /> : '📨'} ส่ง Broadcast
          </button>
        </div>
        <div className="pay" style={{ fontSize: 12 }}>⚠️ กดแล้วส่งเข้า LINE ทันที (นับโควตา push) · ระบบหัก opt-out และกันส่งซ้ำให้อัตโนมัติ</div>
      </div>

      <div>
        <div className="section-head"><h2>ประวัติการส่ง ({history.length})</h2></div>
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>เวลา</th><th>ข้อความ</th><th>กลุ่ม</th><th>ผู้รับ</th><th>สถานะ</th><th style={{ textAlign: 'right' }}>จัดการ</th></tr></thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="time">{new Date(b.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td style={{ maxWidth: 280 }}>{b.content?.title ? `📄 ${b.content.title}` : b.message}</td>
                    <td>{b.audience?.name ? `🎯 ${b.audience.name}` : b.segment?.tags?.length ? b.segment.tags.join(', ') : 'ทั้งหมด'}</td>
                    <td className="total">{b.audienceCount}</td>
                    <td><span className={`pill ${b.status === 'sent' ? 'on' : 'off'}`}>{STATUS_TH[b.status] || b.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      {b.status === 'queued' && b.audienceCount > 0 && (
                        <button className="btn ghost sm" disabled={busy} onClick={() => dispatch(b)}>ส่งจริง</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && <div className="state"><span className="emoji">📣</span> ยังไม่เคยส่ง</div>}
        </div>
      </div>
    </div>
  );
}
