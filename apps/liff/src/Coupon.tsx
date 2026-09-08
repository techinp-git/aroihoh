import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { cancelRedemption, getRedemption, type PendingRedemption } from './api';

/**
 * US-53: คูปองแลกแต้ม — QR ให้คนขายสแกน + นับถอยหลัง + รหัสสำรองให้พิมพ์เอง
 *
 * แต้มยังไม่ถูกตัดจนกว่าคนขายจะกดยืนยัน (US-50) หน้านี้จึง poll สถานะ
 * แล้วเปลี่ยนเป็น "ใช้แล้ว" เอง ลูกค้าไม่ต้องกดรีเฟรช
 */

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Coupon({
  initial,
  onDone,
}: {
  initial: PendingRedemption;
  onDone: () => void;
}) {
  const [coupon, setCoupon] = useState(initial);
  const [left, setLeft] = useState(() => new Date(initial.expiresAt).getTime() - Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const done = coupon.status === 'confirmed';
  const dead = coupon.status === 'expired' || coupon.status === 'cancelled' || left <= 0;

  // วาด QR จาก token (ค่าเดียวกับรหัสที่โชว์ให้พิมพ์เอง)
  useEffect(() => {
    if (!canvasRef.current || done || dead) return;
    QRCode.toCanvas(canvasRef.current, coupon.token, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch(() => {
      /* วาดไม่ได้ก็ยังมีรหัสตัวอักษรให้พิมพ์ */
    });
  }, [coupon.token, done, dead]);

  // นับถอยหลังทุกวินาที
  useEffect(() => {
    if (done || dead) return;
    const t = setInterval(() => setLeft(new Date(coupon.expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [coupon.expiresAt, done, dead]);

  // poll สถานะ — คนขายกดยืนยันแล้วจอเปลี่ยนเอง (จังหวะเดียวกับหน้าติดตามออเดอร์)
  useEffect(() => {
    if (done || dead) return;
    const t = setInterval(() => {
      getRedemption(coupon.id).then(setCoupon).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [coupon.id, done, dead]);

  if (done) {
    return (
      <>
        <div className="done-hero">
          <div className="emoji">✅</div>
          <h2>ใช้คูปองแล้ว</h2>
          <div className="oid">{coupon.rewardName}</div>
        </div>
        <div className="card">
          <div className="line total" style={{ border: 0, marginTop: 0, paddingTop: 0 }}>
            <span>ใช้แต้มไป</span>
            <span>{coupon.pointsCost}</span>
          </div>
          <div className="desc">รับของที่เคาน์เตอร์ได้เลย</div>
        </div>
        <button className="btn primary" onClick={onDone}>กลับไปหน้าแต้ม</button>
      </>
    );
  }

  if (dead) {
    return (
      <>
        <div className="done-hero">
          <div className="emoji">⌛</div>
          <h2>{coupon.status === 'cancelled' ? 'คูปองถูกยกเลิก' : 'คูปองหมดอายุ'}</h2>
        </div>
        <div className="card">
          <div className="desc">แต้มของคุณยังอยู่ครบ — กดแลกใหม่ได้เลย</div>
        </div>
        <button className="btn primary" onClick={onDone}>ขอคูปองใหม่</button>
      </>
    );
  }

  return (
    <>
      <div className="card coupon">
        <div className="coupon-name">{coupon.rewardName}</div>
        <div className="desc">ใช้ {coupon.pointsCost} แต้ม</div>
        <canvas ref={canvasRef} className="coupon-qr" />
        <div className="coupon-timer">{mmss(left)}</div>
        <div className="desc">ยื่นให้พนักงานสแกน · หมดอายุใน {mmss(left)}</div>
        <div className="coupon-code">{coupon.code}</div>
        <div className="desc">สแกนไม่ติด ให้พนักงานพิมพ์รหัสนี้แทนได้</div>
      </div>
      <button
        className="btn ghost"
        onClick={async () => {
          await cancelRedemption(coupon.id).catch(() => {});
          onDone();
        }}
      >
        ยกเลิกคูปอง
      </button>
    </>
  );
}
