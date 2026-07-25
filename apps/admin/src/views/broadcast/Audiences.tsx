import { useEffect, useState, useCallback } from 'react';
import {
  listAudiences, audiencePresets, previewAudienceRules, createAudience, deleteAudience, listTagCounts,
  type Audience, type AudiencePreset, type AudienceRules, type Criterion, type TagCount,
} from '../../api';
import { describeRules, CRITERION_TYPES, defaultCriterion } from './ruleLabels';

const EMPTY: AudienceRules = { match: 'all', criteria: [] };

export default function Audiences({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<Audience[]>([]);
  const [presets, setPresets] = useState<AudiencePreset[]>([]);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [rules, setRules] = useState<AudienceRules>(EMPTY);
  const [reach, setReach] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const [a, p, t] = await Promise.all([listAudiences(brandId), audiencePresets(), listTagCounts(brandId).catch(() => [])]);
      setItems(a); setPresets(p); setTagCounts(t);
    } catch (e) { setError((e as Error).message); }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  // preview reach สดทุกครั้งที่ rules เปลี่ยน (เฉพาะตอนเปิดฟอร์ม)
  useEffect(() => {
    if (!showForm || !brandId) return;
    let alive = true;
    previewAudienceRules(brandId, rules).then((p) => alive && setReach(p.audienceCount)).catch(() => alive && setReach(null));
    return () => { alive = false; };
  }, [brandId, showForm, JSON.stringify(rules)]);

  const openNew = () => { setName(''); setRules(EMPTY); setShowForm(true); setError(''); };
  const applyPreset = (p: AudiencePreset) => { setName(p.name); setRules(p.rules); setShowForm(true); setError(''); };

  const addCriterion = () => setRules((r) => ({ ...r, criteria: [...r.criteria, defaultCriterion('order_count_in_window')] }));
  const removeCriterion = (i: number) => setRules((r) => ({ ...r, criteria: r.criteria.filter((_, idx) => idx !== i) }));
  const patchCriterion = (i: number, patch: Partial<Criterion>) =>
    setRules((r) => ({ ...r, criteria: r.criteria.map((c, idx) => (idx === i ? { ...c, ...patch } as Criterion : c)) }));
  const changeType = (i: number, type: Criterion['type']) =>
    setRules((r) => ({ ...r, criteria: r.criteria.map((c, idx) => (idx === i ? defaultCriterion(type) : c)) }));

  const save = async () => {
    if (!name.trim()) return setError('ตั้งชื่อกลุ่ม');
    setBusy(true); setError('');
    try {
      await createAudience(brandId, { name: name.trim(), rules });
      setShowForm(false); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const remove = async (a: Audience) => {
    if (!window.confirm(`ลบกลุ่ม "${a.name}"?`)) return;
    setBusy(true);
    try { await deleteAudience(brandId, a.id); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="section-head">
        <h2>กลุ่มเป้าหมาย ({items.length})</h2>
        <button className="btn primary sm" onClick={openNew}>+ สร้างกลุ่มเอง</button>
      </div>
      <div className="pay" style={{ marginBottom: 12 }}>สร้างกลุ่มไว้ล่วงหน้าจากพฤติกรรมลูกค้า — คำนวณสดทุกครั้งที่ส่ง (คนเข้า/ออกกลุ่มเองตามข้อมูลจริง)</div>

      {/* preset quick buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {presets.map((p) => (
          <button key={p.key} className="btn ghost sm" onClick={() => applyPreset(p)}>+ {p.name}</button>
        ))}
      </div>

      {showForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 14, maxWidth: 680 }}>
          <label className="field">
            <span>ชื่อกลุ่ม</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="เช่น ลูกค้าประจำ VIP" />
          </label>

          <div className="field">
            <span>เงื่อนไข</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
              <span className="pay">ต้องเข้า</span>
              <select value={rules.match} onChange={(e) => setRules({ ...rules, match: e.target.value as 'all' | 'any' })} style={{ width: 130 }}>
                <option value="all">ทุกเงื่อนไข (และ)</option>
                <option value="any">เงื่อนไขใดก็ได้ (หรือ)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {rules.criteria.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>
                  <select value={c.type} onChange={(e) => changeType(i, e.target.value as Criterion['type'])} style={{ width: 220 }}>
                    {CRITERION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                  {c.type === 'tenure_min_days' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>เกิน
                      <input type="number" min="0" value={c.days} onChange={(e) => patchCriterion(i, { days: +e.target.value })} style={{ width: 80 }} /> วัน</span>
                  )}
                  {c.type === 'order_count_in_window' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>≥
                      <input type="number" min="1" value={c.minCount} onChange={(e) => patchCriterion(i, { minCount: +e.target.value })} style={{ width: 60 }} /> ครั้ง ใน
                      <input type="number" min="1" value={c.windowDays} onChange={(e) => patchCriterion(i, { windowDays: +e.target.value })} style={{ width: 60 }} /> วัน</span>
                  )}
                  {c.type === 'lapsed' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>เงียบ
                      <input type="number" min="1" value={c.inactiveDays} onChange={(e) => patchCriterion(i, { inactiveDays: +e.target.value })} style={{ width: 60 }} /> วัน · เคยสั่งใน
                      <input type="number" min="1" value={c.lookbackDays} onChange={(e) => patchCriterion(i, { lookbackDays: +e.target.value })} style={{ width: 60 }} /> วันก่อน</span>
                  )}
                  {c.type === 'tags' && (
                    <div style={{ flex: 1, minWidth: 160, display: 'grid', gap: 6 }}>
                      {/* คลิกเลือกจากแท็กที่มีอยู่จริง (เข้าเงื่อนไข = มีแท็กใดแท็กหนึ่งที่เลือก) */}
                      {tagCounts.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {tagCounts.map((t) => {
                            const on = c.tags.includes(t.tag);
                            return (
                              <button
                                key={t.tag}
                                onClick={() =>
                                  patchCriterion(i, {
                                    tags: on ? c.tags.filter((x) => x !== t.tag) : [...c.tags, t.tag],
                                  })
                                }
                                style={{
                                  cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                                  border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                                  background: on ? 'var(--accent-weak, #ffe9df)' : 'transparent',
                                  color: on ? 'var(--accent)' : 'var(--text)',
                                }}
                              >
                                {on ? '✓ ' : ''}{t.tag} · {t.count}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {/* พิมพ์แท็กเองได้ (เผื่อยังไม่มีลูกค้าติดแท็กนั้น) */}
                      <input
                        value={c.tags.join(', ')}
                        onChange={(e) => patchCriterion(i, { tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        placeholder={tagCounts.length ? 'หรือพิมพ์เอง: vip, ประจำ' : 'vip, ประจำ'}
                      />
                    </div>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="btn danger sm" onClick={() => removeCriterion(i)}>ลบ</button>
                </div>
              ))}
            </div>
            <button className="btn ghost sm" onClick={addCriterion} style={{ marginTop: 8, alignSelf: 'flex-start' }}>+ เพิ่มเงื่อนไข</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="stat" style={{ padding: '8px 14px', margin: 0 }}>
              <div className="stat-label">👥 เข้ากลุ่มตอนนี้</div>
              <div className="stat-value accent" style={{ fontSize: 22 }}>{reach ?? '…'}</div>
            </div>
            <span style={{ flex: 1 }} />
            <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>{busy ? <span className="spinner" /> : 'บันทึกกลุ่ม'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setShowForm(false)}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>ชื่อกลุ่ม</th><th>เงื่อนไข</th><th style={{ textAlign: 'right' }}>จัดการ</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ maxWidth: 420, color: 'var(--text-faint)' }}>{describeRules(a.rules)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger sm" disabled={busy} onClick={() => remove(a)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="state"><span className="emoji">👥</span> ยังไม่มีกลุ่มเป้าหมาย — กดปุ่ม preset ด้านบนเพื่อเริ่มเร็ว</div>}
      </div>
    </>
  );
}
