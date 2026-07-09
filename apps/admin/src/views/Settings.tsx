import { useState } from 'react';
import { API_BASE, getAdminKey, setAdminKey, clearAdminKey } from '../api';

export default function Settings({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState(getAdminKey());
  const [saved, setSaved] = useState(false);

  const save = () => {
    setAdminKey(key.trim());
    setSaved(true);
    onSaved();
    setTimeout(() => setSaved(false), 1500);
  };

  const signOut = () => {
    clearAdminKey();
    location.reload();
  };

  return (
    <div style={{ maxWidth: 520 }}>
      {saved && <div className="alert info">บันทึกแล้ว</div>}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>การเข้าถึง (ชั่วคราว)</h2>
        <p className="pay" style={{ marginTop: 0, marginBottom: 16 }}>
          ตอนนี้ใช้ admin key ชั่วคราว — จะแทนด้วยระบบล็อกอินจริง (US-29) เร็ว ๆ นี้
        </p>
        <label className="field" style={{ marginBottom: 16 }}>
          <span>admin key</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="x-admin-key" />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={save}>บันทึก</button>
          <button className="btn danger" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>การเชื่อมต่อ</h2>
        <div className="pay">API base</div>
        <div className="oid">{API_BASE}</div>
      </div>
    </div>
  );
}
