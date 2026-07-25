import { useEffect, useState, useCallback, useRef } from 'react';
import {
  listKitchenOrders,
  changeStatus,
  kitchenStreamUrl,
  baht,
  STATUS_TH,
  nextStatus,
  type KitchenOrder,
} from '../api';
import BrandChip from '../components/BrandChip';
import { printHtml, kitchenTicketHtml, riderLabelHtml } from '../lib/print';
import { beep } from '../lib/beep';

const since = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'เพิ่งเข้า';
  if (m < 60) return `${m} นาที`;
  return `${Math.floor(m / 60)} ชม. ${m % 60} น.`;
};

// ปุ่มดันสถานะถัดไป (label ตามมุมครัว) · US-42/43 จะ hook พิมพ์ที่ transition นี้
const ACTION: Record<string, string> = {
  pending: 'รับออเดอร์',
  confirmed: 'เริ่มทำ',
  preparing: 'จัดเสร็จ ✓',
  ready: 'ไรเดอร์รับแล้ว',
};
// สีขอบการ์ดตามสถานะ (สแกนเร็ว)
const TINT: Record<string, string> = {
  pending: '#e2544a',
  confirmed: '#e8734a',
  preparing: '#d9a300',
  ready: '#1d9e75',
};

// US-37: จอครัว (KDS) — คิวออเดอร์รวมทุกแบรนด์ที่ admin มีสิทธิ์ · realtime + เสียงเตือน
export default function Kitchen() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState(false);
  const [, force] = useState(0); // re-render ให้ "เวลา" เดิน
  const knownIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError('');
    try {
      const os = await listKitchenOrders();
      setOrders(os);
      knownIds.current = new Set(os.map((o) => o.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // นาฬิกาเดินทุก 30 วิ (อัปเดตข้อความ "x นาที")
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // realtime SSE รวมทุกแบรนด์ (US-37)
  useEffect(() => {
    const es = new EventSource(kitchenStreamUrl());
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'created' && !knownIds.current.has(e.orderId)) {
          beep();
          setFlash(true);
          setTimeout(() => setFlash(false), 1200);
        }
      } catch { /* ignore */ }
      load();
    };
    return () => es.close();
  }, [load]);

  const advance = async (o: KitchenOrder) => {
    const to = nextStatus(o.status);
    if (!to) return;
    setBusy(o.id);
    setError('');
    try {
      await changeStatus(o.brandId, o.id, to);
      // US-42: รับออเดอร์ (→confirmed) พิมพ์ใบครัว · US-43: จัดเสร็จ (→ready) พิมพ์ label ไรเดอร์
      if (to === 'confirmed') printHtml(kitchenTicketHtml(o));
      else if (to === 'ready') printHtml(riderLabelHtml(o));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className={`pill ${live ? 'on' : 'off'}`}>{live ? '🟢 realtime' : '⚪ offline'}</span>
        <span style={{ color: '#888', fontSize: 13 }}>{orders.length} ออเดอร์ในคิว</span>
        {flash && <span style={{ color: '#e8734a', fontWeight: 600 }}>● ออเดอร์ใหม่!</span>}
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={load}>รีเฟรช</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      {orders.length === 0 ? (
        <div className="state" style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          <div style={{ fontSize: 36 }}>🍳</div>ไม่มีออเดอร์ในคิว
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {orders.map((o) => (
            <div
              key={o.id}
              className="card"
              style={{ padding: 14, borderTop: `4px solid ${TINT[o.status] || '#ccc'}`, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                <BrandChip name={o.brand.name} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    title={o.status === 'ready' ? 'พิมพ์ label ซ้ำ' : 'พิมพ์ใบครัวซ้ำ'}
                    onClick={() => printHtml(o.status === 'ready' ? riderLabelHtml(o) : kitchenTicketHtml(o))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >🖨️</button>
                  <span style={{ fontSize: 12, color: '#999' }}>{since(o.createdAt)}</span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b style={{ fontSize: 15 }}>#{o.id.slice(0, 6)}</b>
                <span className={`pill ${o.status}`} style={{ fontSize: 11 }}>{STATUS_TH[o.status] || o.status}</span>
              </div>
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                {o.items.map((it) => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 2 }}>
                    <span>{it.nameSnapshot}</span>
                    <b style={{ color: '#e8734a' }}>×{it.qty}</b>
                  </div>
                ))}
              </div>
              {o.note && <div style={{ fontSize: 12, color: '#a15', background: '#fff5f7', padding: '4px 8px', borderRadius: 6 }}>📝 {o.note}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#888' }}>
                <span>{o.paymentMethod === 'cod' ? '💵 ปลายทาง' : '💳 จ่ายแล้ว'}</span>
                <span>{baht(o.total)}</span>
              </div>
              {nextStatus(o.status) && (
                <button className="btn primary" style={{ width: '100%' }} onClick={() => advance(o)} disabled={busy === o.id}>
                  {busy === o.id ? <span className="spinner" /> : ACTION[o.status] || 'ถัดไป'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
