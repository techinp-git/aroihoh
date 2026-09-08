import { useEffect, useRef, useState } from 'react';
import {
  confirmRedemption,
  createLoyaltyBatch,
  listLoyaltyBatches,
  listLoyaltyCodes,
  getLoyaltyReport,
  setLoyaltyBatchStatus,
  setLoyaltySettings,
  createLoyaltyReward,
  listLoyaltyRewards,
  previewRedemption,
  updateLoyaltyReward,
  baht,
  type LoyaltyBatch,
  type LoyaltyReport,
  type LoyaltyReward,
  type RedemptionPreview,
} from '../api';
import { beep } from '../lib/beep';
import { printHtml, qrStickerSheetHtml, type StickerLabel } from '../lib/print';

/**
 * US-54 สแกนแลกแต้ม + US-53 จัดการของรางวัล
 *
 * สแกนด้วยกล้อง (getUserMedia + jsQR ถอดเฟรมเอง — ทำงานทั้ง Android/iOS)
 * และมีช่องพิมพ์รหัสเสมอ เพราะกล้องพังหรือไม่ได้สิทธิ์คือเรื่องที่เกิดจริงหน้าร้าน
 *
 * jsQR โหลดแบบ dynamic import ตอนกดเปิดกล้องเท่านั้น — ตัวถอด QR หนัก ~40KB gz
 * ไม่ควรถ่วงทุกหน้าของแอดมินทั้งที่ใช้แค่หน้านี้
 */

type Tab = 'scan' | 'rewards' | 'batches' | 'report';

const BATCH_STATUS_TH: Record<string, string> = { draft: 'ยังไม่เปิดใช้', active: 'เปิดใช้แล้ว', revoked: 'ยกเลิกแล้ว' };

export default function Loyalty({ brandId, canManage }: { brandId: string; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('scan');
  return (
    <>
      <div className="tabs">
        <button className={'tab' + (tab === 'scan' ? ' active' : '')} onClick={() => setTab('scan')}>
          📷 สแกนแลกแต้ม
        </button>
        {canManage && (
          <>
            <button className={'tab' + (tab === 'batches' ? ' active' : '')} onClick={() => setTab('batches')}>
              🏷️ ล็อต QR
            </button>
            <button className={'tab' + (tab === 'rewards' ? ' active' : '')} onClick={() => setTab('rewards')}>
              🎁 ของรางวัล
            </button>
            <button className={'tab' + (tab === 'report' ? ' active' : '')} onClick={() => setTab('report')}>
              📊 รายงาน
            </button>
          </>
        )}
      </div>
      {tab === 'scan' && <ScanTab />}
      {tab === 'batches' && <BatchesTab brandId={brandId} />}
      {tab === 'rewards' && <RewardsTab brandId={brandId} />}
      {tab === 'report' && <ReportTab brandId={brandId} />}
    </>
  );
}

// ───────── สแกน ─────────

function ScanTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lookingUp = useRef(false);
  /** token ที่เพิ่งค้นเจอ (จากกล้องหรือช่องพิมพ์) — ใช้ตอนกดยืนยัน */
  const lastToken = useRef('');

  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [preview, setPreview] = useState<RedemptionPreview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // ปิดกล้องเมื่อออกจากหน้า — ไม่งั้นไฟกล้องค้างและกินแบตมือถือคนขาย
  useEffect(() => stopCamera, []);

  const lookup = async (raw: string) => {
    const token = raw.trim();
    if (!token || lookingUp.current) return;
    lookingUp.current = true;
    lastToken.current = token;
    setResult(null);
    try {
      const p = await previewRedemption(token);
      setPreview(p);
      stopCamera();
      beep(p.confirmable ? 880 : 300);
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      lookingUp.current = false;
    }
  };

  const startCamera = async () => {
    setCamError('');
    setResult(null);
    setPreview(null);
    try {
      const { default: jsQR } = await import('jsqr');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // กล้องหลัง — คนขายหันจอเข้าหาลูกค้า
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const tick = () => {
        const canvas = canvasRef.current;
        if (!canvas || !video.videoWidth) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (hit?.data) {
          void lookup(hit.data);
          return; // เจอแล้วหยุดวน — lookup จะปิดกล้องให้เอง
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      // ไม่ได้สิทธิ์กล้อง/ไม่มีกล้อง = เรื่องปกติหน้าร้าน บอกทางออกแทนที่จะขึ้น error เฉย ๆ
      setCamError(`เปิดกล้องไม่ได้ (${(e as Error).name}) — พิมพ์รหัสบนจอลูกค้าแทนได้`);
      setScanning(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await confirmRedemption(lastToken.current);
      setResult({ ok: true, text: `แลก ${r.rewardName} · ตัด ${r.pointsSpent} แต้ม · เหลือ ${r.balance}` });
      setPreview(null);
      setManual('');
      beep(1200);
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookup(manual);
  };

  return (
    <>
      <div className="card" style={{ padding: 16 }}>
        <div className="stat-label" style={{ marginBottom: 10 }}>สแกน QR คูปองของลูกค้า</div>

        {scanning ? (
          <>
            <video ref={videoRef} className="scan-video" playsInline muted />
            <button className="btn ghost" onClick={stopCamera} style={{ marginTop: 10 }}>หยุดกล้อง</button>
          </>
        ) : (
          <button className="btn primary" onClick={startCamera}>📷 เปิดกล้องสแกน</button>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {camError && <div className="alert" style={{ marginTop: 10 }}>{camError}</div>}

        <form onSubmit={submitManual} className="scan-manual">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="หรือพิมพ์รหัสบนจอลูกค้า เช่น K7QX-2M9F-3BTP"
            autoCapitalize="characters"
          />
          <button className="btn ghost" type="submit" disabled={!manual.trim()}>ค้นหา</button>
        </form>
      </div>

      {preview && (
        <div className="card" style={{ padding: 16 }}>
          <div className="stat-label" style={{ marginBottom: 8 }}>ตรวจก่อนยืนยัน</div>
          <div className="line"><span>ลูกค้า</span><b>{preview.customerName || '—'}</b></div>
          <div className="line"><span>รางวัล</span><b>{preview.rewardName}</b></div>
          <div className="line">
            <span>ตัดแต้ม</span>
            <b>{preview.pointsCost} → เหลือ {Math.max(0, preview.balance - preview.pointsCost)}</b>
          </div>
          <div className="line"><span>สถานะ</span><span className={`pill ${preview.status}`}>{preview.status}</span></div>

          {preview.confirmable ? (
            <button className="btn primary" onClick={confirm} disabled={busy} style={{ marginTop: 12 }}>
              {busy ? 'กำลังยืนยัน…' : '✅ ยืนยันแลก'}
            </button>
          ) : (
            <div className="alert" style={{ marginTop: 12 }}>
              {preview.status === 'confirmed' ? 'คูปองนี้ถูกใช้ไปแล้ว'
                : preview.status === 'expired' ? 'คูปองหมดอายุ — ให้ลูกค้ากดขอใหม่'
                : preview.status === 'cancelled' ? 'คูปองถูกยกเลิกแล้ว'
                : 'แต้มลูกค้าไม่พอแล้ว'}
            </div>
          )}
          <button className="btn ghost" onClick={() => setPreview(null)} style={{ marginTop: 8 }}>ยกเลิก</button>
        </div>
      )}

      {result && (
        <div className={result.ok ? 'alert success' : 'alert error'}>{result.text}</div>
      )}
    </>
  );
}

// ───────── ของรางวัล ─────────

function RewardsTab({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<LoyaltyReward[]>([]);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!brandId) return;
    listLoyaltyRewards(brandId).then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, [brandId]);

  const add = async () => {
    const pointsCost = parseInt(cost, 10);
    if (!name.trim() || !pointsCost) return setErr('กรอกชื่อรางวัลและจำนวนแต้ม');
    setBusy(true);
    setErr('');
    try {
      await createLoyaltyReward({ brandId, name: name.trim(), pointsCost });
      setName('');
      setCost('');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: LoyaltyReward) => {
    await updateLoyaltyReward(brandId, r.id, { isActive: !r.isActive }).catch((e) =>
      setErr((e as Error).message),
    );
    load();
  };

  return (
    <>
      {err && <div className="alert error">{err}</div>}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="stat-label" style={{ marginBottom: 10 }}>เพิ่มของรางวัล</div>
        <div className="scan-manual">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อรางวัล เช่น ข้าวมันไก่ฟรี" />
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))}
            placeholder="แต้ม"
            style={{ maxWidth: 110 }}
          />
          <button className="btn primary" onClick={add} disabled={busy}>เพิ่ม</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>รางวัล</th><th>แต้ม</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} style={{ color: '#6b7280' }}>ยังไม่มีของรางวัล — ลูกค้าจะเห็นแค่ยอดแต้ม ยังแลกอะไรไม่ได้</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {r.type === 'discount' && r.discountAmount != null && (
                      <span style={{ color: '#6b7280' }}> · ลด {baht(r.discountAmount)}</span>
                    )}
                  </td>
                  <td className="total">{r.pointsCost}</td>
                  <td><span className={`pill ${r.isActive ? 'completed' : 'cancelled'}`}>{r.isActive ? 'เปิด' : 'ปิด'}</span></td>
                  <td>
                    <button className="btn ghost" onClick={() => toggle(r)}>{r.isActive ? 'ปิด' : 'เปิด'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ───────── ล็อต QR (US-51) ─────────

/** ดาวน์โหลดไฟล์ที่สร้างในเบราว์เซอร์ — ใส่ BOM ให้ Excel อ่านภาษาไทยไม่เพี้ยน */
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function BatchesTab({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<LoyaltyBatch[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ name: '', points: '10', quantity: '100', expiresAt: '' });

  const load = () => {
    if (!brandId) return;
    listLoyaltyBatches(brandId).then(setRows).catch((e) => setErr((e as Error).message));
  };
  useEffect(load, [brandId]);

  const create = async () => {
    const points = parseInt(form.points, 10);
    const quantity = parseInt(form.quantity, 10);
    if (!form.name.trim() || !points || !quantity) return setErr('กรอกชื่อล็อต แต้ม และจำนวนให้ครบ');
    setBusy('new');
    setErr('');
    try {
      await createLoyaltyBatch({
        brandId,
        name: form.name.trim(),
        points,
        quantity,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      });
      setForm({ name: '', points: '10', quantity: '100', expiresAt: '' });
      setMsg('สร้างล็อตแล้ว — ยังเป็น "ยังไม่เปิดใช้" สแกนไม่ได้จนกว่าของจะถึงร้านแล้วกดเปิด');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const setStatus = async (b: LoyaltyBatch, status: 'active' | 'revoked') => {
    if (status === 'revoked' && !confirm(`ยกเลิกล็อต "${b.name}"? สติกเกอร์ที่แจกไปแล้วจะสแกนไม่ได้ทั้งหมด`)) return;
    setBusy(b.id);
    try {
      await setLoyaltyBatchStatus(brandId, b.id, status);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const exportCsv = async (b: LoyaltyBatch) => {
    setBusy(b.id);
    setErr('');
    try {
      const res = await listLoyaltyCodes(brandId, b.id);
      if (!res.batch.liffId) setErr('⚠️ แบรนด์นี้ยังไม่ได้ตั้ง LIFF ID — คอลัมน์ลิงก์จะว่าง ลูกค้าสแกนแล้วเปิดไม่ได้ (ตั้งที่ ตั้งค่า → เชื่อมต่อ LINE OA)');
      downloadCsv(
        `qr-${b.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          ['code', 'human', 'points', 'url'],
          ...res.codes.map((c) => [c.code, c.human, String(c.points), c.url ?? '']),
        ],
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const printSheet = async (b: LoyaltyBatch) => {
    setBusy(b.id);
    setErr('');
    try {
      const res = await listLoyaltyCodes(brandId, b.id);
      if (!res.batch.liffId) {
        setErr('ยังไม่ได้ตั้ง LIFF ID ของแบรนด์นี้ — พิมพ์ไปลูกค้าสแกนแล้วเปิดไม่ได้ ตั้งที่ ตั้งค่า → เชื่อมต่อ LINE OA ก่อน');
        return;
      }
      // qrcode หนักและใช้แค่ตอนพิมพ์ → โหลดตอนกดเท่านั้น
      const QRCode = (await import('qrcode')).default;
      const labels: StickerLabel[] = await Promise.all(
        res.codes.map(async (c) => ({
          qrDataUrl: await QRCode.toDataURL(c.url!, { width: 300, margin: 0, errorCorrectionLevel: 'M' }),
          human: c.human,
          points: c.points,
        })),
      );
      printHtml(qrStickerSheetHtml(labels, { brandName: res.batch.brandName, batchName: res.batch.name }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert info">{msg}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="stat-label" style={{ marginBottom: 10 }}>สร้างล็อตสติกเกอร์ QR</div>
        <div className="scan-manual">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อล็อต เช่น สติกเกอร์ใต้ฝากล่อง ก.ย."
          />
          <input
            value={form.points}
            onChange={(e) => setForm({ ...form, points: e.target.value.replace(/\D/g, '') })}
            placeholder="แต้ม/ใบ"
            style={{ maxWidth: 110 }}
          />
          <input
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, '') })}
            placeholder="จำนวนใบ"
            style={{ maxWidth: 110 }}
          />
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            style={{ maxWidth: 160 }}
          />
          <button className="btn primary" onClick={create} disabled={busy === 'new'}>
            {busy === 'new' ? 'กำลังสร้าง…' : 'สร้างล็อต'}
          </button>
        </div>
        <div className="page-sub" style={{ marginTop: 8 }}>
          สร้างแล้วยัง <b>ไม่เปิดใช้</b> — พิมพ์/ส่งโรงพิมพ์ให้เสร็จ ของถึงร้านแล้วค่อยกด "เปิดใช้"
          เพื่อไม่ให้ใครสแกนได้ระหว่างทาง (สูงสุด 2,000 ใบต่อล็อต)
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>ล็อต</th><th>แต้ม/ใบ</th><th>ใช้แล้ว</th><th>สถานะ</th><th>หมดอายุ</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ color: '#6b7280' }}>ยังไม่มีล็อต — สร้างล็อตแรกเพื่อพิมพ์สติกเกอร์</td></tr>
              )}
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="total">{b.points}</td>
                  <td className="total">{b.usedCount} / {b.codeCount}</td>
                  <td>
                    <span className={`pill ${b.status === 'active' ? 'completed' : b.status === 'revoked' ? 'cancelled' : 'pending'}`}>
                      {BATCH_STATUS_TH[b.status]}
                    </span>
                  </td>
                  <td className="time">{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('th-TH') : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost" onClick={() => printSheet(b)} disabled={!!busy}>🖨️ พิมพ์</button>
                      <button className="btn ghost" onClick={() => exportCsv(b)} disabled={!!busy}>⬇ CSV</button>
                      {b.status === 'draft' && (
                        <button className="btn primary" onClick={() => setStatus(b, 'active')} disabled={!!busy}>เปิดใช้</button>
                      )}
                      {b.status === 'active' && (
                        <button className="btn ghost" onClick={() => setStatus(b, 'revoked')} disabled={!!busy}>ยกเลิก</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ───────── รายงาน + กันโกง (US-55) ─────────

function ReportTab({ brandId }: { brandId: string }) {
  const [data, setData] = useState<LoyaltyReport | null>(null);
  const [days, setDays] = useState(14);
  const [err, setErr] = useState('');
  const [cap, setCap] = useState('');
  const [rate, setRate] = useState('');
  const [capMsg, setCapMsg] = useState('');

  const load = () => {
    if (!brandId) return;
    getLoyaltyReport(brandId, days)
      .then((d) => { setData(d); setCap(String(d.dailyEarnCap)); setRate(String(d.bahtPerPoint ?? 0)); })
      .catch((e) => setErr((e as Error).message));
  };
  useEffect(load, [brandId, days]);

  const saveSettings = async () => {
    setCapMsg('');
    try {
      const r = await setLoyaltySettings(brandId, {
        dailyEarnCap: parseInt(cap, 10) || 0,
        bahtPerPoint: parseInt(rate, 10) || 0,
      });
      setCap(String(r.dailyEarnCap));
      setRate(String(r.bahtPerPoint ?? 0));
      setCapMsg(
        `บันทึกแล้ว — สแกนได้ ${r.dailyEarnCap} ใบ/วัน · ` +
          (r.bahtPerPoint ? `ทุก ${r.bahtPerPoint} บาทได้ 1 แต้ม` : 'ปิดการให้แต้มอัตโนมัติจากออเดอร์'),
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (err) return <div className="alert error">{err}</div>;
  if (!data) return <div className="card" style={{ padding: 16 }}>กำลังโหลด…</div>;

  return (
    <>
      {/* หน้านี้เปิดค้างไว้เฝ้าดูความผิดปกติ → ต้องมีปุ่มโหลดใหม่ ไม่ใช่ต้องรีเฟรชทั้งแอป */}
      <div className="report-head">
        <div className="tabs">
          {[7, 14, 30].map((d) => (
            <button key={d} className={'tab' + (days === d ? ' active' : '')} onClick={() => setDays(d)}>
              {d} วัน
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={load}>↻ โหลดใหม่</button>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="stat"><div className="stat-label">แต้มที่แจกไป</div><div className="stat-value">{data.totals.earned.toLocaleString('th-TH')}</div></div>
        <div className="stat"><div className="stat-label">แต้มที่ถูกแลก</div><div className="stat-value">{data.totals.redeemed.toLocaleString('th-TH')}</div></div>
        <div className="stat"><div className="stat-label">สแกนทั้งหมด</div><div className="stat-value">{data.totals.scans.toLocaleString('th-TH')} ใบ</div></div>
        <div className="stat">
          <div className="stat-label">แต้มค้างในระบบ</div>
          <div className="stat-value accent">{data.totals.outstandingPoints.toLocaleString('th-TH')}</div>
        </div>
      </div>
      <div className="page-sub" style={{ marginBottom: 16 }}>
        "แต้มค้าง" คือแต้มที่ลูกค้าถืออยู่และยังไม่ได้แลก — เป็นของรางวัลที่ร้านต้องเตรียมจ่ายในอนาคต
      </div>

      {data.anomalies.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="stat-label" style={{ marginBottom: 8 }}>⚠️ สแกนรัวผิดปกติ</div>
          <div className="page-sub" style={{ marginBottom: 10 }}>
            ลูกค้าที่สแกนเกิน {data.anomalies[0].threshold} ใบภายใน {data.anomalies[0].windowMinutes} นาที —
            อาจเป็นคนเก็บสติกเกอร์ที่ยังไม่แจกมาสแกนเอง ลองเทียบกับยอดขายช่วงนั้น
          </div>
          {data.anomalies.map((a) => (
            <div key={a.customerId} className="line">
              <span>{a.displayName || a.customerId.slice(0, 8)}</span>
              <b>{a.scans} ใบ ใน {a.windowMinutes} นาที</b>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>วันที่</th><th>แต้มที่แจก</th><th>แต้มที่แลก</th></tr></thead>
            <tbody>
              {data.daily.length === 0 && <tr><td colSpan={3} style={{ color: '#6b7280' }}>ยังไม่มีรายการในช่วงนี้</td></tr>}
              {data.daily.map((d) => (
                <tr key={d.date}>
                  <td className="time">{new Date(d.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                  <td className="total">+{d.earned}</td>
                  <td className="total">{d.redeemed ? `-${d.redeemed}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>ล็อต</th><th>แต้ม/ใบ</th><th>ใช้แล้ว</th><th>สถานะ</th></tr></thead>
            <tbody>
              {data.batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="total">{b.points}</td>
                  <td className="total">{b.usedCount} / {b.codeCount}</td>
                  <td><span className={`pill ${b.status === 'active' ? 'completed' : b.status === 'revoked' ? 'cancelled' : 'pending'}`}>{BATCH_STATUS_TH[b.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="stat-label" style={{ marginBottom: 8 }}>ตั้งค่าสะสมแต้ม</div>

        <div className="page-sub" style={{ marginBottom: 6 }}>
          <b>เพดานสแกนต่อวัน (ต่อลูกค้า 1 คน)</b> — กันคนเก็บสติกเกอร์ที่ยังไม่แจกมาสแกนรวดเดียว ·
          ใส่ 0 = กลับไปใช้ค่าเริ่มต้นของระบบ
        </div>
        <div className="scan-manual" style={{ marginTop: 4 }}>
          <input value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 120 }} />
          <span className="page-sub" style={{ alignSelf: 'center' }}>ใบ/วัน</span>
        </div>

        <div className="page-sub" style={{ margin: '14px 0 6px' }}>
          <b>ให้แต้มอัตโนมัติเมื่อออเดอร์ส่งสำเร็จ (US-56)</b> — ทุกกี่บาทได้ 1 แต้ม ·
          คิดจากค่าอาหารหลังหักส่วนลด ไม่รวมค่าส่ง · <b>ใส่ 0 = ปิด</b>
        </div>
        <div className="scan-manual" style={{ marginTop: 4 }}>
          <input value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 120 }} />
          <span className="page-sub" style={{ alignSelf: 'center' }}>บาท = 1 แต้ม</span>
          <button className="btn primary" onClick={saveSettings}>บันทึก</button>
        </div>
        {capMsg && <div className="alert info" style={{ marginTop: 10 }}>{capMsg}</div>}
      </div>
    </>
  );
}
