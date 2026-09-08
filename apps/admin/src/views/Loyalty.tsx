import { useEffect, useRef, useState } from 'react';
import {
  confirmRedemption,
  createLoyaltyReward,
  listLoyaltyRewards,
  previewRedemption,
  updateLoyaltyReward,
  baht,
  type LoyaltyReward,
  type RedemptionPreview,
} from '../api';
import { beep } from '../lib/beep';

/**
 * US-54 สแกนแลกแต้ม + US-53 จัดการของรางวัล
 *
 * สแกนด้วยกล้อง (getUserMedia + jsQR ถอดเฟรมเอง — ทำงานทั้ง Android/iOS)
 * และมีช่องพิมพ์รหัสเสมอ เพราะกล้องพังหรือไม่ได้สิทธิ์คือเรื่องที่เกิดจริงหน้าร้าน
 *
 * jsQR โหลดแบบ dynamic import ตอนกดเปิดกล้องเท่านั้น — ตัวถอด QR หนัก ~40KB gz
 * ไม่ควรถ่วงทุกหน้าของแอดมินทั้งที่ใช้แค่หน้านี้
 */

type Tab = 'scan' | 'rewards';

export default function Loyalty({ brandId, canManage }: { brandId: string; canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('scan');
  return (
    <>
      <div className="tabs">
        <button className={'tab' + (tab === 'scan' ? ' active' : '')} onClick={() => setTab('scan')}>
          📷 สแกนแลกแต้ม
        </button>
        {canManage && (
          <button className={'tab' + (tab === 'rewards' ? ' active' : '')} onClick={() => setTab('rewards')}>
            🎁 ของรางวัล
          </button>
        )}
      </div>
      {tab === 'scan' ? <ScanTab /> : <RewardsTab brandId={brandId} />}
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
