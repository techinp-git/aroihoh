import { useCallback, useEffect, useState } from 'react';
import {
  getPreorderSettings,
  setPreorderCutoff,
  createPreorderSlot,
  updatePreorderSlot,
  deletePreorderSlot,
  type PreorderSettings,
} from '../../api';

const EMPTY_NEW = { name: '', startTime: '11:00', endTime: '12:30' };

/**
 * US-22: ตั้งค่าสั่งล่วงหน้า D-1 (owner/manager)
 *
 * ค่าสองตัวนี้คือตัวกำหนดว่าจะรวมรอบส่งได้หรือไม่: ปิดรับเร็ว = ครัวมีเวลาเตรียมของและ
 * รวมจุดส่งได้ · ปิดรับช้า = ได้ออเดอร์มากขึ้นแต่เตรียมไม่ทัน
 * เก็บไว้ที่ "ครัว" ไม่ใช่ที่แบรนด์ เพราะครัวเดียวทำหลายแบรนด์ต้องรวมรอบเดียวกัน
 */
export default function PreorderCard({ brandId }: { brandId: string }) {
  const [cfg, setCfg] = useState<PreorderSettings | null>(null);
  const [cutoff, setCutoff] = useState('');
  const [add, setAdd] = useState(EMPTY_NEW);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const c = await getPreorderSettings(brandId);
      setCfg(c);
      setCutoff(c.cutoffTime);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  /** ทุก mutation คืน settings ชุดเต็มกลับมา → แทน state รอบเดียว ไม่ต้องโหลดซ้ำ */
  const run = async (fn: () => Promise<PreorderSettings>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const c = await fn();
      setCfg(c);
      setCutoff(c.cutoffTime);
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const activeCount = cfg?.slots.filter((s) => s.isActive).length ?? 0;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h2
        style={{
          marginTop: 0,
          fontSize: 15,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        สั่งล่วงหน้า (D-1)
        <span className={`pill ${cfg?.preorderEnabled ? 'on' : 'off'}`}>
          {cfg?.preorderEnabled ? `เปิด · ${activeCount} รอบ` : 'ยังไม่เปิด'}
        </span>
      </h2>

      {msg && (
        <div className={msg.ok ? 'alert success' : 'alert error'} style={{ marginBottom: 12 }}>
          {msg.ok ? '✅' : '⚠️'} {msg.text}
        </div>
      )}

      {!cfg ? (
        <div className="pay">กำลังโหลด…</div>
      ) : (
        <>
          <div className="pay" style={{ marginBottom: 14 }}>
            ลูกค้าสั่งวันนี้ก่อนเวลาปิดรับ แล้วเลือกรอบส่งของพรุ่งนี้ · ตั้งที่ครัว{' '}
            <b>{cfg.kitchenName}</b> — ทุกแบรนด์ที่ใช้ครัวนี้ใช้รอบเดียวกัน
          </div>

          {!cfg.preorderEnabled && (
            <div className="alert error" style={{ marginBottom: 12 }}>
              ไม่มีรอบส่งที่เปิดใช้งาน — ลูกค้าจะไม่เห็นตัวเลือก "สั่งล่วงหน้า" ใน LIFF เลย
            </div>
          )}

          <div className="pay">เวลาปิดรับออเดอร์ของวันถัดไป</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 4px' }}>
            <input
              type="time"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              style={{ width: 130 }}
            />
            <button
              className="btn primary sm"
              disabled={busy || !cutoff || cutoff === cfg.cutoffTime}
              onClick={() => run(() => setPreorderCutoff(brandId, cutoff), 'บันทึกเวลาปิดรับแล้ว')}
            >
              บันทึก
            </button>
          </div>
          <div className="pay" style={{ marginBottom: 16 }}>
            เลยเวลานี้แล้ว ลูกค้าสั่งรอบของพรุ่งนี้ไม่ได้ (server ปฏิเสธเสมอ ไม่ใช่แค่ซ่อนปุ่ม)
          </div>

          <div className="pay" style={{ marginBottom: 6 }}>รอบส่งของวันถัดไป</div>
          {cfg.slots.length === 0 && <div className="pay">ยังไม่มีรอบส่ง</div>}
          {cfg.slots.map((s) => (
            <SlotRow
              key={s.id}
              slot={s}
              busy={busy}
              onSave={(patch) =>
                run(() => updatePreorderSlot(brandId, s.id, patch), 'บันทึกรอบส่งแล้ว')
              }
              onDelete={() => run(() => deletePreorderSlot(brandId, s.id), 'ลบรอบส่งแล้ว')}
            />
          ))}

          {adding ? (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                placeholder="ชื่อรอบ เช่น รอบเที่ยง"
                value={add.name}
                onChange={(e) => setAdd({ ...add, name: e.target.value })}
                style={{ width: 170 }}
              />
              <input
                type="time"
                value={add.startTime}
                onChange={(e) => setAdd({ ...add, startTime: e.target.value })}
                style={{ width: 115 }}
              />
              <span>–</span>
              <input
                type="time"
                value={add.endTime}
                onChange={(e) => setAdd({ ...add, endTime: e.target.value })}
                style={{ width: 115 }}
              />
              <button
                className="btn primary sm"
                disabled={busy || !add.name.trim()}
                onClick={async () => {
                  await run(() => createPreorderSlot(brandId, add), 'เพิ่มรอบส่งแล้ว');
                  setAdd(EMPTY_NEW);
                  setAdding(false);
                }}
              >
                เพิ่ม
              </button>
              <button className="btn ghost sm" onClick={() => setAdding(false)}>
                ยกเลิก
              </button>
            </div>
          ) : (
            <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
              + เพิ่มรอบส่ง
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  busy,
  onSave,
  onDelete,
}: {
  slot: PreorderSettings['slots'][number];
  busy: boolean;
  onSave: (patch: {
    name?: string;
    startTime?: string;
    endTime?: string;
    isActive?: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState({ name: slot.name, startTime: slot.startTime, endTime: slot.endTime });
  // รอบถูกบันทึก/รีเฟรชจาก server → ฟอร์มต้องตามค่าใหม่ ไม่ค้างค่าที่พิมพ์ไว้
  useEffect(() => {
    setF({ name: slot.name, startTime: slot.startTime, endTime: slot.endTime });
  }, [slot.id, slot.name, slot.startTime, slot.endTime]);
  const dirty = f.name !== slot.name || f.startTime !== slot.startTime || f.endTime !== slot.endTime;

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 0',
        opacity: slot.isActive ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          style={{ flex: 1, minWidth: 0 }}
          placeholder="ชื่อรอบ"
        />
        <label className="switch" title={slot.isActive ? 'เปิดใช้งานอยู่' : 'ปิดใช้งาน'}>
          <input
            type="checkbox"
            checked={slot.isActive}
            disabled={busy}
            onChange={(e) => onSave({ isActive: e.target.checked })}
          />
          <span className="slider" />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="time"
          value={f.startTime}
          onChange={(e) => setF({ ...f, startTime: e.target.value })}
          style={{ width: 105 }}
        />
        <span>–</span>
        <input
          type="time"
          value={f.endTime}
          onChange={(e) => setF({ ...f, endTime: e.target.value })}
          style={{ width: 105 }}
        />
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {/* แก้เวลาตอนมีออเดอร์จองค้าง = server ตอบ 409 พร้อมบอกให้ปิดใช้งานแทน */}
          {dirty && (
            <button
              className="btn primary sm"
              disabled={busy || !f.name.trim()}
              onClick={() => onSave(f)}
            >
              บันทึก
            </button>
          )}
          <button
            className="btn danger sm"
            disabled={busy}
            onClick={() => {
              if (confirm(`ลบรอบ "${slot.name}" ?`)) onDelete();
            }}
          >
            ลบ
          </button>
        </div>
      </div>
    </div>
  );
}
