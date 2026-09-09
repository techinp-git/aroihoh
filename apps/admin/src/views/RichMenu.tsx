import { useEffect, useState } from 'react';
import {
  listRichMenus,
  createRichMenu,
  updateRichMenu,
  deleteRichMenu,
  publishRichMenu,
  syncRichMenus,
  richMenuImageUrl,
  listAudiences,
  RICH_MENU_PRESETS,
  type RichMenuRow,
  type RichMenuSyncResult,
  type RichMenuPublishResult,
  type Audience,
} from '../api';

/**
 * Rich Menu ตามกลุ่ม (audience) + default
 *
 * - เมนู default (คนใหม่/ไม่เข้ากลุ่มไหน) มีได้แบรนด์ละ 1
 * - เมนูกลุ่ม ผูกกับ Audience (สร้างที่หน้า "ส่งข่าวสาร → กลุ่มเป้าหมาย") · เลือกตาม priority เลขน้อย=ก่อน
 * - รูปพื้นหลัง generate อัตโนมัติจากปุ่ม · กด "เผยแพร่" เพื่อยิงขึ้น LINE (ต้องผูก LINE OA ก่อน)
 * - กด "Sync" เพื่อผูกเมนูกลุ่มให้ลูกค้าที่เข้ากลุ่ม (คนใหม่ได้เมนูตอน follow อัตโนมัติ)
 */
export default function RichMenu({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<RichMenuRow[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [sync, setSync] = useState<RichMenuSyncResult | null>(null);

  // ฟอร์มสร้าง
  const [name, setName] = useState('');
  const [audienceId, setAudienceId] = useState(''); // '' = default menu
  const [preset, setPreset] = useState('default');
  const [priority, setPriority] = useState('100');
  const [chatBarText, setChatBarText] = useState('เมนู');

  const load = () => {
    if (!brandId) return;
    listRichMenus(brandId).then(setRows).catch((e) => setErr((e as Error).message));
    listAudiences(brandId).then(setAudiences).catch(() => setAudiences([]));
  };
  useEffect(load, [brandId]);

  const hasDefault = rows.some((r) => r.isDefault);

  const create = async () => {
    if (!name.trim()) return setErr('ตั้งชื่อเมนูก่อน');
    setBusy('create');
    setErr('');
    setMsg('');
    try {
      const r = await createRichMenu(brandId, {
        name: name.trim(),
        audienceId: audienceId || null,
        preset,
        priority: audienceId ? parseInt(priority, 10) || 100 : undefined,
        chatBarText: chatBarText.trim() || 'เมนู',
      });
      setName('');
      setAudienceId('');
      setMsg(
        r.publish?.skipped
          ? 'บันทึกเมนูแล้ว ✓ (ยังไม่ได้ผูก LINE OA → ยังไม่เผยแพร่ขึ้น LINE) — กด "เผยแพร่" อีกครั้งเมื่อผูก LINE แล้ว'
          : r.publish?.published
            ? 'สร้าง + เผยแพร่ขึ้น LINE สำเร็จ ✓'
            : 'สร้างเมนูแล้ว ✓',
      );
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const publish = async (r: RichMenuRow) => {
    setBusy(r.id);
    setErr('');
    setMsg('');
    try {
      const res: RichMenuPublishResult = await publishRichMenu(brandId, r.id);
      setMsg(
        res.skipped
          ? `"${r.name}": ยังไม่ได้ผูก LINE OA — เผยแพร่ไม่ได้ (ตั้งที่ ตั้งค่า → เชื่อมต่อ LINE OA)`
          : res.published
            ? `เผยแพร่ "${r.name}" ขึ้น LINE สำเร็จ ✓`
            : `"${r.name}": ${res.error ?? 'เผยแพร่ไม่สำเร็จ'}`,
      );
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const toggleEnabled = async (r: RichMenuRow) => {
    setBusy(r.id);
    try {
      await updateRichMenu(brandId, r.id, { enabled: !r.enabled });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (r: RichMenuRow) => {
    if (!confirm(`ลบเมนู "${r.name}"?` + (r.isDefault ? '\n(เมนู default — ต้องไม่มีเมนูกลุ่มเหลืออยู่)' : ''))) return;
    setBusy(r.id);
    setErr('');
    try {
      await deleteRichMenu(brandId, r.id);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const runSync = async () => {
    setBusy('sync');
    setErr('');
    setMsg('');
    setSync(null);
    try {
      setSync(await syncRichMenus(brandId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="alert info" style={{ margin: 0 }}>
        เมนู <b>default</b> ใช้กับคนใหม่/คนที่ไม่เข้ากลุ่มไหน (มีได้ 1 อัน) · เมนู <b>กลุ่ม</b> ผูกกับกลุ่มเป้าหมาย
        แล้วกด <b>Sync</b> เพื่อผูกให้ลูกค้าที่เข้ากลุ่ม · รูปพื้นหลัง generate อัตโนมัติจากปุ่ม
      </div>

      {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
      {msg && <div className="alert info" style={{ margin: 0 }}>{msg}</div>}

      {/* สร้างเมนู */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>➕ สร้าง Rich Menu</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <label className="field">
            <span>ชื่อเมนู (ภายใน)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เมนูหลัก / เมนู VIP" />
          </label>
          <label className="field">
            <span>ใช้กับ</span>
            <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
              <option value="" disabled={hasDefault}>
                — เมนูเริ่มต้น (default){hasDefault ? ' — มีแล้ว' : ''} —
              </option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>กลุ่ม: {a.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>รูปแบบปุ่ม (preset)</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {RICH_MENU_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          {audienceId && (
            <label className="field">
              <span>ลำดับความสำคัญ (น้อย=ก่อน)</span>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>ข้อความบนแถบเมนู (≤14)</span>
            <input value={chatBarText} maxLength={14} onChange={(e) => setChatBarText(e.target.value)} />
          </label>
        </div>
        {!audiences.length && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
            ยังไม่มีกลุ่มเป้าหมาย — สร้างที่ <b>ส่งข่าวสาร → กลุ่มเป้าหมาย</b> ก่อน ถึงจะทำเมนูตามกลุ่มได้
          </div>
        )}
        <button className="btn primary" style={{ marginTop: 12 }} disabled={busy === 'create'} onClick={create}>
          {busy === 'create' ? 'กำลังสร้าง…' : 'สร้างเมนู'}
        </button>
      </div>

      {/* Sync */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy === 'sync'} onClick={runSync}>
            {busy === 'sync' ? 'กำลัง Sync…' : '🔄 Sync เมนูตามกลุ่ม'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            ผูกเมนูกลุ่มให้ลูกค้าที่เข้ากลุ่ม (bulk) — รันเมื่อแก้กลุ่ม/แต้ม/แท็กลูกค้าเปลี่ยน
          </span>
        </div>
        {sync && (
          <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
            {sync.skipped
              ? `ยังไม่ได้ผูก LINE OA — Sync ไม่ได้ (${sync.reason ?? ''})`
              : `เปลี่ยน ${sync.changed ?? 0} คน · คงเดิม ${sync.unchanged ?? 0} · กลับ default ${sync.movedToDefault ?? 0}` +
                (sync.perMenu?.length ? ' · ' + sync.perMenu.map((m) => `${m.name}: ${m.count}`).join(', ') : '')}
          </div>
        )}
      </div>

      {/* รายการเมนู */}
      {!hasDefault && (
        <div className="alert error" style={{ margin: 0 }}>
          ⚠️ ยังไม่มีเมนู <b>default</b> — คนใหม่/คนที่ไม่เข้ากลุ่มจะไม่มีเมนู แนะนำสร้าง default ก่อน
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, opacity: r.enabled ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <b>{r.name}</b>
              {r.isDefault ? (
                <span className="pill" style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>default</span>
              ) : (
                <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  กลุ่ม: {r.audienceName ?? '—'} · #{r.priority}
                </span>
              )}
            </div>
            {r.hasImage && (
              <img
                src={`${richMenuImageUrl(r.id)}&t=${Date.parse(r.updatedAt)}`}
                alt={r.name}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', aspectRatio: '2500 / 1686', objectFit: 'cover' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="pill" style={r.published
                ? { background: 'var(--st-completed-bg,#dcfce7)', color: 'var(--st-completed,#16a34a)' }
                : { background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                {r.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่'}
              </span>
              {!r.isDefault && <span>ผูกอยู่ {r.assignedCount} คน</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
              <button className="btn sm" disabled={busy === r.id} onClick={() => publish(r)}>
                {r.published ? '↻ เผยแพร่ใหม่' : '⬆ เผยแพร่'}
              </button>
              <button className="btn sm ghost" disabled={busy === r.id} onClick={() => toggleEnabled(r)}>
                {r.enabled ? 'ปิดใช้' : 'เปิดใช้'}
              </button>
              <button className="btn sm danger" disabled={busy === r.id} onClick={() => remove(r)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
      {!rows.length && (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 24 }}>ยังไม่มี Rich Menu — สร้างอันแรกด้านบน</div>
      )}
    </div>
  );
}
