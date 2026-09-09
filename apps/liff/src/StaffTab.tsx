import { useEffect, useRef, useState } from 'react';
import liff from '@line/liff';
import {
  clearStaffToken,
  confirmRedemption,
  previewRedemption,
  staffPasswordLogin,
  staffUnlink,
  type RedemptionPreview,
  type StaffSession,
} from './staff';

/**
 * US-61: หน้าสแกนแลกแต้มสำหรับคนขายหน้าร้าน — อยู่ใน LIFF ตัวเดียวกับลูกค้า
 *
 * ทำไมไม่ให้ไปใช้หน้าแอดมิน: คนขายมี LINE เปิดอยู่แล้วตอนลูกค้ายื่นคูปองให้ดู
 * การสลับไปเปิดเบราว์เซอร์ + ล็อกอินใหม่ทุกกะ คือจุดที่ของจริงจะไม่ถูกใช้
 *
 * แท็บนี้โผล่เฉพาะบัญชี LINE ที่ผูกกับบัญชีแอดมินไว้แล้ว (ลูกค้าทั่วไปไม่เห็นอะไรเลย)
 * และตัวที่กันจริงคือ @Roles + assertBrandAccess ที่ API — ฝั่งนี้แค่ไม่โชว์ปุ่มที่กดแล้ว 403
 *
 * ลำดับการสแกน: scanCodeV2 ของ LINE (ถ้าเปิดไว้ใน LIFF settings) → กล้องในหน้าเว็บ + jsQR → พิมพ์รหัสเอง
 * ช่องพิมพ์รหัสโชว์เสมอ ไม่ใช่ fallback ที่ซ่อนไว้ — กล้องไม่ได้สิทธิ์คือเรื่องที่เกิดจริงหน้าร้าน
 */

const vibrate = (ms: number | number[]) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* เครื่องไม่รองรับก็ไม่เป็นไร */
  }
};

/** แยกชื่อไว้เพราะในคอมโพเนนต์ `confirm` เป็นชื่อฟังก์ชันยืนยันคูปองไปแล้ว */
const askConfirm = (msg: string) => window.confirm(msg);

/** LINE เปิดให้ใช้ตัวสแกนของแอปเองไหม (ต้องเปิด "Scan QR" ใน LIFF settings ด้วย) */
function nativeScanAvailable(): boolean {
  try {
    return liff.isApiAvailable('scanCodeV2');
  } catch {
    return false; // ยังไม่ init (dev) = ไม่มี
  }
}

export default function StaffTab({
  session,
  idToken,
  onSession,
  onExit,
}: {
  session: StaffSession | null;
  idToken?: string;
  onSession: (s: StaffSession | null) => void;
  onExit: () => void;
}) {
  if (!session) return <StaffLogin idToken={idToken} onSession={onSession} />;

  if (!session.canScanRedemptions) {
    return (
      <div className="card">
        <h3>โหมดพนักงาน</h3>
        <div className="alert">
          บัญชี {session.admin.name} ไม่มีสิทธิ์ยืนยันคูปองของร้านนี้ — ให้เจ้าของร้านตั้งสิทธิ์เป็น
          พนักงาน/ผู้จัดการ แล้วผูกแบรนด์นี้ให้ก่อน
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            clearStaffToken();
            onSession(null);
            onExit();
          }}
        >
          ออกจากโหมดพนักงาน
        </button>
      </div>
    );
  }

  return <Scanner session={session} onSession={onSession} onExit={onExit} />;
}

// ───────── ล็อกอินครั้งแรก ─────────

function StaffLogin({
  idToken,
  onSession,
}: {
  idToken?: string;
  onSession: (s: StaffSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onSession(await staffPasswordLogin(email.trim(), password, idToken));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>โหมดพนักงาน</h3>
      <p className="staff-hint">
        สำหรับคนขายหน้าร้านเท่านั้น — ใช้อีเมล/รหัสผ่านของบัญชีหลังร้าน
        {idToken
          ? ' ครั้งเดียว หลังจากนี้เปิดจาก LINE เครื่องนี้แล้วเข้าได้เลย'
          : ' (เปิดนอกแอป LINE จึงยังจำเครื่องนี้ไว้ไม่ได้)'}
      </p>
      {err && <div className="alert">{err}</div>}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="อีเมล"
        autoCapitalize="none"
        autoComplete="username"
        style={{ marginBottom: 8 }}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="รหัสผ่าน"
        autoComplete="current-password"
        style={{ marginBottom: 12 }}
      />
      <button className="btn primary" type="submit" disabled={busy || !email.trim() || !password}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่โหมดพนักงาน'}
      </button>
    </form>
  );
}

// ───────── สแกน + ยืนยัน ─────────

function Scanner({
  session,
  onSession,
  onExit,
}: {
  session: StaffSession;
  onSession: (s: StaffSession | null) => void;
  onExit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lookingUp = useRef(false);
  /** รหัสที่เพิ่งค้นเจอ (จากกล้องหรือช่องพิมพ์) — ใช้ตอนกดยืนยัน */
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

  // ปิดกล้องเมื่อออกจากแท็บ — ไม่งั้นไฟกล้องค้างและกินแบตมือถือคนขาย
  useEffect(() => stopCamera, []);

  const expired = (e: unknown) => (e as { status?: number }).status === 401;

  const lookup = async (raw: string) => {
    const token = raw.trim();
    if (!token || lookingUp.current) return;
    lookingUp.current = true;
    lastToken.current = token;
    setResult(null);
    // ล้างใบเดิมก่อนเสมอ — ไม่งั้นรหัสที่ค้นไม่เจอจะทิ้งการ์ดของลูกค้าคนก่อนค้างอยู่บนจอ
    setPreview(null);
    try {
      const p = await previewRedemption(token);
      setPreview(p);
      stopCamera();
      vibrate(p.confirmable ? 60 : 200);
    } catch (e) {
      if (expired(e)) return kickOut();
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      lookingUp.current = false;
    }
  };

  /** token หมดอายุ (12 ชม.) = กลับไปหน้าเข้าสู่ระบบ ไม่ใช่ปุ่มที่กดแล้วเงียบ */
  const kickOut = () => {
    stopCamera();
    clearStaffToken();
    onSession(null);
  };

  /** ตัวสแกนของ LINE เอง — ไม่ต้องขอสิทธิ์กล้องในหน้าเว็บ อ่านไวกว่าและไม่กินแบต */
  const nativeScan = async () => {
    setCamError('');
    setResult(null);
    setPreview(null);
    try {
      const r = await liff.scanCodeV2();
      if (r?.value) await lookup(r.value);
    } catch (e) {
      setCamError(`ตัวสแกนของ LINE ใช้ไม่ได้ (${(e as Error).message}) — ลองเปิดกล้องในหน้านี้แทน`);
    }
  };

  const startCamera = async () => {
    setCamError('');
    setResult(null);
    setPreview(null);
    try {
      // jsQR หนัก ~40KB gz — โหลดตอนกดเปิดกล้องเท่านั้น ไม่ถ่วงหน้าสั่งอาหารของลูกค้า
      const { default: jsQR } = await import('jsqr');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // กล้องหลัง — คนขายหันเครื่องเข้าหาจอลูกค้า
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
          return; // เจอแล้วหยุดวน — lookup ปิดกล้องให้เอง
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
      setResult({
        ok: true,
        text: `แลก ${r.rewardName} · ตัด ${r.pointsSpent} แต้ม · เหลือ ${r.balance}`,
      });
      setPreview(null);
      setManual('');
      vibrate([60, 60, 60]);
    } catch (e) {
      if (expired(e)) return kickOut();
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!askConfirm('เลิกผูก LINE เครื่องนี้กับบัญชีพนักงาน? ครั้งหน้าต้องพิมพ์อีเมล/รหัสผ่านใหม่')) return;
    await staffUnlink().catch(() => {});
    kickOut();
    onExit();
  };

  return (
    <>
      <div className="card">
        <div className="staff-who">
          <span>
            👤 {session.admin.name} · {session.admin.role}
          </span>
          <button className="linkbtn" onClick={() => { kickOut(); onExit(); }}>
            ออก
          </button>
        </div>
      </div>

      <div className="card">
        <h3>สแกน QR คูปองของลูกค้า</h3>

        {scanning ? (
          <>
            <video ref={videoRef} className="scan-video" playsInline muted />
            <button className="btn ghost" onClick={stopCamera} style={{ marginTop: 10 }}>
              หยุดกล้อง
            </button>
          </>
        ) : (
          <div className="staff-scanbtns">
            {nativeScanAvailable() && (
              <button className="btn primary" onClick={nativeScan}>
                📷 สแกนด้วย LINE
              </button>
            )}
            <button
              className={'btn ' + (nativeScanAvailable() ? 'ghost' : 'primary')}
              onClick={startCamera}
            >
              เปิดกล้องในหน้านี้
            </button>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {camError && <div className="alert" style={{ marginTop: 10 }}>{camError}</div>}

        <form
          className="scan-manual"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(manual);
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="หรือพิมพ์รหัสบนจอลูกค้า เช่น K7QX-2M9F-3BTP"
            autoCapitalize="characters"
          />
          <button className="btn ghost" type="submit" disabled={!manual.trim()}>
            ค้นหา
          </button>
        </form>
      </div>

      {preview && (
        <div className="card">
          <h3>ตรวจก่อนยืนยัน</h3>
          <div className="line"><span>ลูกค้า</span><b>{preview.customerName || '—'}</b></div>
          <div className="line"><span>รางวัล</span><b>{preview.rewardName}</b></div>
          <div className="line">
            <span>ตัดแต้ม</span>
            <b>
              {preview.pointsCost} → เหลือ {Math.max(0, preview.balance - preview.pointsCost)}
            </b>
          </div>

          {preview.confirmable ? (
            <button className="btn primary" onClick={confirm} disabled={busy} style={{ marginTop: 12 }}>
              {busy ? 'กำลังยืนยัน…' : '✅ ยืนยันแลก'}
            </button>
          ) : (
            <div className="alert" style={{ marginTop: 12 }}>
              {preview.status === 'confirmed'
                ? 'คูปองนี้ถูกใช้ไปแล้ว'
                : preview.status === 'expired'
                  ? 'คูปองหมดอายุ — ให้ลูกค้ากดขอใหม่'
                  : preview.status === 'cancelled'
                    ? 'คูปองถูกยกเลิกแล้ว'
                    : 'แต้มลูกค้าไม่พอแล้ว'}
            </div>
          )}
          <button className="btn ghost" onClick={() => setPreview(null)} style={{ marginTop: 8 }}>
            ยกเลิก
          </button>
        </div>
      )}

      {result && <div className={result.ok ? 'zone-ok' : 'alert'}>{result.text}</div>}

      <button className="linkbtn staff-unlink" onClick={unlink}>
        เลิกผูก LINE เครื่องนี้กับบัญชีพนักงาน
      </button>
    </>
  );
}
