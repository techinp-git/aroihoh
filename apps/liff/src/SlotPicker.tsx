import { useEffect, useState } from 'react';
import type { DeliverySlots } from './api';

/** "อีก 2 ชม. 14 นาที" — ต่ำกว่า 1 นาทีบอกเป็นวินาที ไม่ให้ขึ้น "อีก 0 นาที" แล้วค้าง */
export function countdownTH(ms: number): string {
  if (ms <= 0) return 'ปิดรับแล้ว';
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `อีก ${h} ชม.${m > 0 ? ` ${m} นาที` : ''}`;
  if (m > 0) return `อีก ${m} นาที`;
  return `อีก ${sec} วินาที`;
}

const dayTH = (key: string) =>
  new Date(`${key}T00:00:00+07:00`).toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

/**
 * US-22: เลือกเวลาจัดส่ง — "เร็วที่สุดวันนี้" หรือรอบของพรุ่งนี้
 *
 * เลยเวลาปิดรับแล้วรอบนั้นต้อง "กดไม่ได้พร้อมบอกเหตุผล" ไม่ใช่กดแล้วเงียบ
 * หรือไปเจอ error ตอนกดสั่ง (server ก็ปฏิเสธด้วย — ตรงนี้เป็นแค่ UX)
 */
export default function SlotPicker({
  data,
  value,
  onChange,
}: {
  data: DeliverySlots;
  /** null = รับวันนี้ (พฤติกรรมเดิม) */
  value: string | null;
  onChange: (slotId: string | null) => void;
}) {
  // นับถอยหลังโดยยึด "นาฬิกาของ server" เป็นฐาน แล้วเดินต่อด้วยนาฬิกาเครื่อง
  // (มือถือที่ตั้งเวลาผิดจะเห็นเวลาที่เหลือผิด แล้วกดสั่งตอนที่ปิดรับไปแล้ว)
  // ไม่ใช้ msLeft ตรง ๆ ไม่งั้นค้างค่าเดิมตั้งแต่ตอนโหลดหน้า
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // จุดอ้างอิง = (เวลา server, เวลาเครื่อง) ณ ตอนที่ข้อมูลชุดนี้มาถึง
  // ต้องตั้งใหม่ทุกครั้งที่โหลดรอบใหม่ ไม่งั้น skew จะกินเวลาที่ผ่านไปตั้งแต่ mount ด้วย
  const [anchor, setAnchor] = useState(() => ({
    server: new Date(data.now).getTime(),
    local: Date.now(),
  }));
  useEffect(() => {
    setAnchor({ server: new Date(data.now).getTime(), local: Date.now() });
  }, [data.now]);
  const now = anchor.server + (tick - anchor.local);

  if (data.slots.length === 0) return null; // ร้านไม่ได้เปิดสั่งล่วงหน้า → ไม่ต้องโชว์อะไรเลย

  const cutoffMs = new Date(data.cutoffAt).getTime() - now;
  const allClosed = cutoffMs <= 0;

  return (
    <div className="card">
      <h3>เวลาจัดส่ง</h3>

      <div className="chiprow">
        <button className={'chip' + (value === null ? ' on' : '')} onClick={() => onChange(null)}>
          ⚡ เร็วที่สุดวันนี้
        </button>
      </div>

      <div className="slot-head">
        <b>{dayTH(data.serviceDate)}</b>
        <span className={allClosed ? 'slot-closed' : 'slot-left'}>
          {allClosed
            ? `ปิดรับแล้ว (ปิด ${data.cutoffTime})`
            : `ปิดรับ ${data.cutoffTime} · ${countdownTH(cutoffMs)}`}
        </span>
      </div>

      <div className="chiprow">
        {data.slots.map((s) => {
          // ยึดเวลาจริงตอนนี้ ไม่ใช่ค่า closed ที่ติดมาตอนโหลดหน้า (ลูกค้าเปิดค้างไว้ได้)
          const closed = s.closed || new Date(s.cutoffAt).getTime() <= now;
          return (
            <button
              key={s.id}
              className={'chip' + (value === s.id ? ' on' : '') + (closed ? ' off' : '')}
              disabled={closed}
              onClick={() => onChange(s.id)}
            >
              🗓️ {s.name} {s.startTime}–{s.endTime}
            </button>
          );
        })}
      </div>

      {allClosed ? (
        <div className="picker-note">
          ปิดรับออเดอร์ล่วงหน้าของ{dayTH(data.serviceDate)}แล้ว (ปิดรับ {data.cutoffTime}) —
          สั่งรับวันนี้ได้ตามปกติ หรือกลับมาสั่งล่วงหน้าพรุ่งนี้
        </div>
      ) : value !== null ? (
        <div className="picker-note">
          อาหารจะถึงใน{dayTH(data.serviceDate)} ตามช่วงเวลาที่เลือก — ร้านทำอาหารใกล้เวลาส่ง
          เพื่อให้ได้ของสดใหม่
        </div>
      ) : (
        <div className="picker-note">
          สั่งล่วงหน้าเลือกช่วงเวลาส่งได้ และร้านเตรียมของตามยอดที่ปิดรับแล้ว
        </div>
      )}
    </div>
  );
}
