import { useState } from 'react';
import AddressPicker from './AddressPicker';
import {
  baht,
  createAddress,
  deleteAddress,
  updateAddress,
  type DeliveryOrigin,
  type Profile,
  type SavedAddress,
} from './api';

/**
 * US-59: แท็บโปรไฟล์ — avatar/ชื่อ · การ์ดแต้ม (EP-14) · สมุดที่อยู่ · ออเดอร์ล่าสุด
 * ส่วน "ตั้งค่า" (เบอร์โทร / รับข่าวสาร / privacy policy) อยู่ใน US-60
 */

/** ป้ายสำเร็จรูป — คนส่วนใหญ่มีแค่ 2 ที่ ไม่ต้องให้พิมพ์เอง */
const PRESETS = [
  { label: 'บ้าน', icon: '🏠' },
  { label: 'ที่ทำงาน', icon: '🏢' },
];

export const addressIcon = (label: string | null) =>
  PRESETS.find((p) => p.label === label)?.icon ?? '📍';

const STATUS_TH: Record<string, string> = {
  pending: 'รอยืนยัน', confirmed: 'ร้านรับแล้ว', preparing: 'กำลังทำ',
  ready: 'รอไรเดอร์', delivering: 'กำลังส่ง', completed: 'ส่งสำเร็จ', cancelled: 'ยกเลิก',
};

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

interface Draft {
  id: string | null; // null = หมุดใหม่
  label: string;
  detail: string;
  note: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export default function ProfileTab({
  profile,
  origin,
  onAddresses,
  onOpenOrder,
  onStartOrdering,
}: {
  profile: Profile;
  origin: DeliveryOrigin | null;
  onAddresses: (list: SavedAddress[]) => void;
  onOpenOrder: (orderId: string) => void;
  onStartOrdering: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const full = profile.addresses.length >= profile.addressLimit;

  const startNew = () => {
    setErr('');
    setDraft({
      id: null,
      label: PRESETS[0].label,
      detail: '',
      note: '',
      // ตั้งหมุดเริ่มต้นที่ครัว — ใกล้ลูกค้าที่สุดโดยเฉลี่ย และเห็นวงเขตทันที
      lat: origin?.lat ?? 13.74,
      lng: origin?.lng ?? 100.562,
      isDefault: profile.addresses.length === 0,
    });
  };

  const startEdit = (a: SavedAddress) => {
    setErr('');
    setDraft({
      id: a.id,
      label: a.label ?? '',
      detail: a.detail,
      note: a.note ?? '',
      lat: a.lat,
      lng: a.lng,
      isDefault: a.isDefault,
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.detail.trim()) return setErr('กรอกรายละเอียดที่อยู่ก่อน');
    setBusy(true);
    setErr('');
    try {
      const body = {
        label: draft.label.trim(),
        detail: draft.detail.trim(),
        note: draft.note.trim(),
        lat: draft.lat,
        lng: draft.lng,
        isDefault: draft.isDefault,
      };
      const res = draft.id ? await updateAddress(draft.id, body) : await createAddress(body);
      onAddresses(res.addresses);
      setDraft(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (!confirm('ลบที่อยู่นี้ออกจากสมุด?')) return;
    setBusy(true);
    try {
      onAddresses((await deleteAddress(draft.id)).addresses);
      setDraft(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── ฟอร์มแก้/เพิ่มหมุด ──
  if (draft) {
    return (
      <div className="card">
        <h3>{draft.id ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่ใหม่'}</h3>
        {err && <div className="alert">{err}</div>}

        <label className="fld">ป้ายชื่อ</label>
        <div className="chiprow">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={'chip' + (draft.label === p.label ? ' on' : '')}
              onClick={() => setDraft({ ...draft, label: p.label })}
            >
              {p.icon} {p.label}
            </button>
          ))}
          <input
            className="chip-input"
            value={PRESETS.some((p) => p.label === draft.label) ? '' : draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="ตั้งชื่อเอง"
          />
        </div>

        <AddressPicker
          origin={origin}
          value={{ lat: draft.lat, lng: draft.lng }}
          onChange={(p) => setDraft({ ...draft, lat: p.lat, lng: p.lng })}
        />

        <label className="fld">รายละเอียดที่อยู่</label>
        <input
          value={draft.detail}
          onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
          placeholder="บ้านเลขที่ / ซอย / ถนน"
        />

        <label className="fld" style={{ marginTop: 10 }}>โน้ตให้ไรเดอร์ (ไม่บังคับ)</label>
        <input
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="ชั้น / ห้อง / ฝากไว้ที่ รปภ."
        />

        <label className="check">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
          />
          ใช้ที่อยู่นี้เป็นค่าเริ่มต้นตอนสั่ง
        </label>

        <div className="rowbtns">
          <button className="btn ghost" onClick={() => setDraft(null)} disabled={busy}>ยกเลิก</button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? <div className="spinner" /> : 'บันทึก'}
          </button>
        </div>
        {draft.id && (
          <button className="btn danger" onClick={remove} disabled={busy} style={{ marginTop: 10 }}>
            ลบที่อยู่นี้
          </button>
        )}
      </div>
    );
  }

  // ── หน้าโปรไฟล์ ──
  return (
    <>
      <div className="prof-hero">
        {profile.pictureUrl ? (
          <img className="prof-avatar" src={profile.pictureUrl} alt="" />
        ) : (
          <div className="prof-avatar fallback">{(profile.displayName || '?').slice(0, 1)}</div>
        )}
        <div>
          <div className="prof-name">{profile.displayName || 'ลูกค้า'}</div>
          <div className="prof-since">สมาชิกตั้งแต่ {thaiDate(profile.memberSince)}</div>
        </div>
      </div>

      {/* การ์ดแต้ม — โผล่เมื่อ EP-14 (US-50) ลงแล้วเท่านั้น */}
      {profile.loyalty && (
        <div className="card points-card">
          <div className="line total" style={{ border: 0, margin: 0, paddingTop: 0 }}>
            <span>แต้มสะสม</span>
            <span>{profile.loyalty.balance.toLocaleString('th-TH')}</span>
          </div>
          {profile.loyalty.nextReward && (
            <div className="desc">
              อีก {Math.max(0, profile.loyalty.nextReward.pointsCost - profile.loyalty.balance)} แต้ม
              แลก {profile.loyalty.nextReward.name}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>ที่อยู่ของฉัน</h3>
        {profile.addresses.length === 0 && (
          <div className="empty">ยังไม่มีที่อยู่ที่บันทึกไว้ — บันทึกไว้แล้วครั้งหน้าสั่งได้เร็วขึ้น</div>
        )}
        {profile.addresses.map((a) => (
          <button key={a.id} className="addr-row" onClick={() => startEdit(a)}>
            <span className="addr-ico">{addressIcon(a.label)}</span>
            <span className="addr-main">
              <span className="addr-label">
                {a.label || 'ที่อยู่'}
                {a.isDefault && <span className="pill">ค่าเริ่มต้น</span>}
                {a.deliverable === false && <span className="pill warn">นอกเขตส่ง</span>}
              </span>
              <span className="addr-detail">{a.detail}</span>
              {a.note && <span className="addr-detail">📝 {a.note}</span>}
            </span>
            <span className="addr-go">›</span>
          </button>
        ))}
        <button className="btn ghost" onClick={startNew} disabled={full} style={{ marginTop: 10 }}>
          {full ? `ครบ ${profile.addressLimit} ที่แล้ว — ลบก่อนถึงเพิ่มได้` : '+ เพิ่มที่อยู่'}
        </button>
      </div>

      <div className="card">
        <h3>ออเดอร์ล่าสุด</h3>
        {profile.recentOrders.length === 0 && (
          <div className="empty">ยังไม่เคยสั่ง — ลองดูเมนูก่อนได้</div>
        )}
        {profile.recentOrders.map((o) => (
          <button key={o.id} className="addr-row" onClick={() => onOpenOrder(o.id)}>
            <span className="addr-main">
              <span className="addr-label">
                #{o.id.slice(0, 8)}
                <span className="pill">{STATUS_TH[o.status] || o.status}</span>
              </span>
              <span className="addr-detail">
                {o.items.map((i) => `${i.nameSnapshot} ×${i.qty}`).join(', ')}
              </span>
              <span className="addr-detail">{thaiDate(o.createdAt)} · {baht(o.total)}</span>
            </span>
            <span className="addr-go">›</span>
          </button>
        ))}
        <button className="btn ghost" onClick={onStartOrdering} style={{ marginTop: 10 }}>
          สั่งอาหาร
        </button>
      </div>
    </>
  );
}
