import { API_BASE, clearAuth, ROLE_TH, type AdminProfile } from '../api';

export default function Settings({ profile }: { profile: AdminProfile | null }) {
  const signOut = () => {
    clearAuth();
    location.reload();
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>บัญชีของฉัน</h2>
        {profile ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><b>{profile.name}</b></div>
            <div className="pay">{profile.email}</div>
            <div>
              บทบาท: <span className="pill on">{ROLE_TH[profile.role] || profile.role}</span>
            </div>
          </div>
        ) : (
          <div className="pay">—</div>
        )}
        <div style={{ marginTop: 16 }}>
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
