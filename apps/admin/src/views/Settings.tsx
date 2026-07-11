import { useEffect, useState, useCallback } from 'react';
import {
  API_BASE,
  clearAuth,
  setBrandCod,
  getStore,
  setStorePause,
  setStoreHours,
  getLineConfig,
  updateLineConfig,
  testLineConfig,
  ROLE_TH,
  type AdminProfile,
  type Brand,
  type StoreState,
  type LineConfig,
} from '../api';

// การ์ดตั้งค่า LINE OA (SETUP-1) — owner เท่านั้น · secret/token ไม่ถูกส่งกลับมาแสดง
function LineSetupCard({ brandId }: { brandId: string }) {
  const [cfg, setCfg] = useState<LineConfig | null>(null);
  const [f, setF] = useState({ channelId: '', liffId: '', channelSecret: '', channelAccessToken: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const c = await getLineConfig(brandId);
      setCfg(c);
      setF((prev) => ({ ...prev, channelId: c.channelId, liffId: c.liffId }));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      // ส่ง secret/token เฉพาะเมื่อกรอกใหม่ (เว้นว่าง = คงค่าเดิม)
      const body: Record<string, string> = { channelId: f.channelId, liffId: f.liffId };
      if (f.channelSecret) body.channelSecret = f.channelSecret;
      if (f.channelAccessToken) body.channelAccessToken = f.channelAccessToken;
      const c = await updateLineConfig(brandId, body);
      setCfg(c);
      setF((prev) => ({ ...prev, channelSecret: '', channelAccessToken: '' }));
      setMsg({ ok: true, text: 'บันทึกแล้ว' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await testLineConfig(brandId);
      setMsg(r.ok ? { ok: true, text: `เชื่อมสำเร็จ — บอท: ${r.name || '(ไม่มีชื่อ)'}` } : { ok: false, text: r.error || 'เชื่อมไม่สำเร็จ' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const copyWebhook = () => {
    if (!cfg) return;
    navigator.clipboard?.writeText(cfg.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const field = (label: string, key: keyof typeof f, opts: { password?: boolean; placeholder?: string; set?: boolean } = {}) => (
    <label className="field" style={{ marginBottom: 10 }}>
      <span>{label}{opts.set ? ' · ตั้งไว้แล้ว (เว้นว่าง=คงเดิม)' : ''}</span>
      <input
        type={opts.password ? 'password' : 'text'}
        value={f[key]}
        placeholder={opts.placeholder}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        เชื่อมต่อ LINE OA (SETUP-1)
        <span className={`pill ${cfg?.configured ? 'on' : 'off'}`}>{cfg?.configured ? '🟢 เชื่อมแล้ว' : '⚪ ยังไม่เชื่อม'}</span>
      </h2>
      <div className="pay" style={{ marginBottom: 14 }}>
        เอาค่าจาก LINE Developers → Messaging API channel มากรอก แล้วเอา Webhook URL ด้านล่างไปตั้งใน LINE
      </div>

      {msg && <div className="alert" style={{ background: msg.ok ? 'var(--st-completed-bg)' : 'var(--st-cancelled-bg)', color: msg.ok ? 'var(--st-completed)' : 'var(--st-cancelled)', marginBottom: 12 }}>{msg.ok ? '✅' : '⚠️'} {msg.text}</div>}

      {field('Channel ID', 'channelId', { placeholder: '2000xxxxxx' })}
      {field('Channel secret', 'channelSecret', { password: true, set: cfg?.hasChannelSecret, placeholder: cfg?.hasChannelSecret ? '•••••••• (ตั้งไว้แล้ว)' : '' })}
      {field('Channel access token', 'channelAccessToken', { password: true, set: cfg?.hasAccessToken, placeholder: cfg?.hasAccessToken ? '•••••••• (ตั้งไว้แล้ว)' : '' })}
      {field('LIFF ID', 'liffId', { placeholder: '2000xxxxxx-abcdEFGH' })}

      <div className="pay" style={{ margin: '10px 0 4px' }}>Webhook URL (วางใน LINE Developers → Messaging API → Use webhook = เปิด)</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="oid" style={{ flex: 1, wordBreak: 'break-all' }}>{cfg?.webhookUrl || '—'}</div>
        <button className="btn ghost sm" onClick={copyWebhook}>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'บันทึก'}</button>
        <button className="btn ghost" disabled={busy} onClick={test}>ทดสอบการเชื่อมต่อ</button>
      </div>
      <div className="pay" style={{ fontSize: 12, marginTop: 10 }}>
        ⚠️ Webhook ต้องเป็น HTTPS สาธารณะ — ตอน dev ใช้ tunnel (เช่น cloudflared) หรือ deploy ก่อน
      </div>
    </div>
  );
}

export default function Settings({
  profile,
  brandId,
  brands,
  onBrandsChanged,
}: {
  profile: AdminProfile | null;
  brandId: string;
  brands: Brand[];
  onBrandsChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [store, setStore] = useState<StoreState | null>(null);
  const [hours, setHours] = useState({ open: '', close: '' });
  const brand = brands.find((b) => b.id === brandId);
  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  const loadStore = useCallback(async () => {
    if (!brandId) return;
    try {
      const s = await getStore(brandId);
      setStore(s);
      setHours({ open: s.openTime || '', close: s.closeTime || '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brandId]);

  useEffect(() => {
    if (canManage) loadStore();
  }, [canManage, loadStore]);

  const signOut = () => {
    clearAuth();
    location.reload();
  };

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCod = () => brand && wrap(async () => { await setBrandCod(brand.id, !brand.codEnabled); onBrandsChanged(); });
  const togglePause = () => store && wrap(async () => setStore(await setStorePause(brandId, !store.isOpen)));
  const saveHours = () => wrap(async () => setStore(await setStoreHours(brandId, hours.open || null, hours.close || null)));
  const clearHours = () => wrap(async () => { setHours({ open: '', close: '' }); setStore(await setStoreHours(brandId, null, null)); });

  return (
    <div style={{ maxWidth: 520 }}>
      {error && <div className="alert error">{error}</div>}

      {/* LINE OA connection (SETUP-1) — owner only */}
      {profile?.role === 'owner' && brandId && <LineSetupCard brandId={brandId} />}

      {/* store hours + pause (US-16) */}
      {canManage && store && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15, display: 'flex', justifyContent: 'space-between' }}>
            สถานะร้าน — {store.name}
            <span className={`pill ${store.acceptingNow ? 'on' : 'off'}`}>
              {store.acceptingNow ? 'รับออเดอร์อยู่' : store.reason || 'ปิด'}
            </span>
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label className="switch">
              <input type="checkbox" checked={store.isOpen} disabled={busy} onChange={togglePause} />
              <span className="slider" />
            </label>
            <div>
              <div style={{ fontWeight: 600 }}>เปิดรับออเดอร์</div>
              <div className="pay">ปิดสวิตช์ = พักรับออเดอร์ฉุกเฉิน (ครัวล้น/ของหมด)</div>
            </div>
          </div>

          <div className="pay" style={{ marginBottom: 6 }}>เวลาทำการ (ว่าง = เปิดตลอด)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} />
            <span>–</span>
            <input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} />
            <button className="btn primary sm" disabled={busy} onClick={saveHours}>บันทึก</button>
            <button className="btn ghost sm" disabled={busy} onClick={clearHours}>ล้าง</button>
          </div>
        </div>
      )}

      {/* COD (US-07) */}
      {canManage && brand && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>รับเงินปลายทาง (COD)</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="switch">
              <input type="checkbox" checked={!!brand.codEnabled} disabled={busy} onChange={toggleCod} />
              <span className="slider" />
            </label>
            <div className="pay">{brand.codEnabled ? 'เปิดรับ' : 'ปิดรับ'} — ลูกค้าเลือกจ่ายปลายทางได้</div>
          </div>
        </div>
      )}

      {/* account */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>บัญชีของฉัน</h2>
        {profile ? (
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><b>{profile.name}</b></div>
            <div className="pay">{profile.email}</div>
            <div>บทบาท: <span className="pill on">{ROLE_TH[profile.role] || profile.role}</span></div>
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
