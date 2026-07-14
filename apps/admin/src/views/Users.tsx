import { useEffect, useState, useCallback } from 'react';
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  ROLE_TH,
  type AdminUser,
  type Brand,
} from '../api';

const ROLES = ['owner', 'manager', 'staff', 'kitchen', 'chat_agent'];
// role ที่ผูกแบรนด์ (ต้องเลือกแบรนด์อย่างน้อย 1) — owner/manager เห็นทุกแบรนด์
const BRAND_SCOPED = ['staff', 'kitchen', 'chat_agent'];

export default function Users({ brands, selfId }: { brands: Brand[]; selfId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // create form
  const [f, setF] = useState({ email: '', password: '', name: '', role: 'staff', brandIds: [] as string[] });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await listAdminUsers());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError('');
    if (f.password.length < 8) return setError('รหัสผ่านอย่างน้อย 8 ตัวอักษร');
    if (BRAND_SCOPED.includes(f.role) && f.brandIds.length === 0) return setError('role นี้ต้องเลือกแบรนด์อย่างน้อย 1');
    setBusy('new');
    try {
      await createAdminUser({
        email: f.email,
        password: f.password,
        name: f.name,
        role: f.role,
        brandIds: BRAND_SCOPED.includes(f.role) ? f.brandIds : undefined,
      });
      setF({ email: '', password: '', name: '', role: 'staff', brandIds: [] });
      setShowForm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const patch = async (u: AdminUser, body: Parameters<typeof updateAdminUser>[1]) => {
    setBusy(u.id);
    try {
      await updateAdminUser(u.id, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleBrand = (id: string) =>
    setF((s) => ({
      ...s,
      brandIds: s.brandIds.includes(id) ? s.brandIds.filter((x) => x !== id) : [...s.brandIds, id],
    }));

  return (
    <>
      {error && <div className="alert error">{error}</div>}

      <div className="section-head">
        <h2>ผู้ใช้ทั้งหมด ({users.length})</h2>
        <button className="btn primary sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'ปิด' : '+ เพิ่มผู้ใช้'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 12, maxWidth: 560 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span>ชื่อ</span>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span>อีเมล</span>
              <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span>รหัสผ่าน (≥8)</span>
              <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </label>
            <label className="field" style={{ minWidth: 140 }}>
              <span>บทบาท</span>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_TH[r]}</option>
                ))}
              </select>
            </label>
          </div>
          {BRAND_SCOPED.includes(f.role) && (
            <div className="field">
              <span>แบรนด์ที่ดูแล</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                {brands.map((b) => (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={f.brandIds.includes(b.id)} onChange={() => toggleBrand(b.id)} />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <button className="btn primary" disabled={busy === 'new'} onClick={submit}>
              สร้างผู้ใช้
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ผู้ใช้</th>
                <th>บทบาท</th>
                <th>แบรนด์</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === selfId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.name}{isSelf && <span className="pay"> (คุณ)</span>}</div>
                      <div className="pay">{u.email}</div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={isSelf || busy === u.id}
                        onChange={(e) => patch(u, { role: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_TH[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>{u.role === 'staff' ? `${u.brandIds.length} แบรนด์` : 'ทุกแบรนด์'}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={u.isActive}
                          disabled={isSelf || busy === u.id}
                          onChange={() => patch(u, { isActive: !u.isActive })}
                        />
                        <span className="slider" />
                      </label>
                      <span className={`pill ${u.isActive ? 'on' : 'off'}`} style={{ marginLeft: 10 }}>
                        {u.isActive ? 'ใช้งาน' : 'ปิด'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <div className="state"><span className="spinner" /> กำลังโหลด…</div>}
      </div>
    </>
  );
}
