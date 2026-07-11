import { useEffect, useState, useCallback } from 'react';
import { listContent, createContent, updateContent, deleteContent, type Content } from '../../api';

export default function ContentLib({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<Content[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Content | null>(null);
  const [f, setF] = useState({ title: '', body: '' });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    try { setItems(await listContent(brandId)); } catch (e) { setError((e as Error).message); }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setF({ title: '', body: '' }); setShowForm(true); setError(''); };
  const openEdit = (c: Content) => { setEditing(c); setF({ title: c.title, body: c.body }); setShowForm(true); setError(''); };

  const save = async () => {
    if (!f.title.trim() || !f.body.trim()) return setError('กรอกหัวข้อและข้อความ');
    setBusy(true); setError('');
    try {
      if (editing) await updateContent(brandId, editing.id, { title: f.title.trim(), body: f.body.trim() });
      else await createContent(brandId, f.title.trim(), f.body.trim());
      setShowForm(false); setEditing(null); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const remove = async (c: Content) => {
    if (!window.confirm(`ลบข้อความ "${c.title}"?`)) return;
    setBusy(true);
    try { await deleteContent(brandId, c.id); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="section-head">
        <h2>คลังข้อความ ({items.length})</h2>
        <button className="btn primary sm" onClick={openNew}>+ เขียนข้อความใหม่</button>
      </div>
      <div className="pay" style={{ marginBottom: 12 }}>เขียนเก็บไว้ก่อน แล้วเลือกใช้ตอนส่งข่าวสาร — ใช้ซ้ำได้ ไม่ต้องพิมพ์ใหม่</div>

      {showForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 12, maxWidth: 620 }}>
          <div style={{ fontWeight: 700 }}>{editing ? 'แก้ไขข้อความ' : 'เขียนข้อความใหม่'}</div>
          <label className="field">
            <span>หัวข้อ (ใช้ภายใน ลูกค้าไม่เห็น)</span>
            <input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="เช่น โปรลูกค้าประจำ" />
          </label>
          <label className="field">
            <span>ข้อความที่ลูกค้าจะได้รับ</span>
            <textarea rows={4} value={f.body} maxLength={1000} onChange={(e) => setF({ ...f, body: e.target.value })}
              placeholder="🎉 ขอบคุณที่อุดหนุน! วันนี้ลด 15%…"
              style={{ resize: 'vertical', font: 'inherit', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'right' }}>{f.body.length}/1000</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : editing ? 'บันทึก' : 'สร้าง'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setShowForm(false)}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>หัวข้อ</th><th>ข้อความ</th><th>แก้ล่าสุด</th><th style={{ textAlign: 'right' }}>จัดการ</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td style={{ maxWidth: 360, color: 'var(--text-faint)' }}>{c.body}</td>
                  <td className="time">{new Date(c.updatedAt).toLocaleDateString('th-TH')}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" disabled={busy} onClick={() => openEdit(c)}>แก้ไข</button>
                    <button className="btn danger sm" disabled={busy} onClick={() => remove(c)} style={{ marginLeft: 6 }}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="state"><span className="emoji">📝</span> ยังไม่มีข้อความในคลัง</div>}
      </div>
    </>
  );
}
