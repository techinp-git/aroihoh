import { useEffect, useState, useCallback } from 'react';
import {
  listOrders,
  changeStatus,
  markPaid,
  baht,
  STATUS_TH,
  ALL_STATUSES,
  nextStatus,
  API_BASE,
  getAdminToken,
  type Order,
} from '../api';

// เสียงเตือนสั้น ๆ ผ่าน Web Audio (ไม่ต้องมีไฟล์เสียง)
function beep() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.18);
    o.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}

export default function Orders({ brandId }: { brandId: string }) {
  const [filter, setFilter] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setError('');
    try {
      setOrders(await listOrders(brandId, filter || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  // US-11: realtime — ออเดอร์ใหม่เด้ง + เสียงเตือน (SSE, EventSource reconnect เอง)
  useEffect(() => {
    if (!brandId) return;
    const es = new EventSource(
      `${API_BASE}/admin/orders/stream?brandId=${brandId}&token=${encodeURIComponent(getAdminToken())}`,
    );
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === 'created') {
          beep();
          setFlash(true);
          setTimeout(() => setFlash(false), 4000);
        }
      } catch {
        /* ignore */
      }
      load();
    };
    return () => es.close();
  }, [brandId, load]);

  const act = async (o: Order, run: () => Promise<unknown>) => {
    setBusy(o.id);
    try {
      await run();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const advance = (o: Order) => {
    const to = nextStatus(o.status);
    if (to) act(o, () => changeStatus(brandId, o.id, to));
  };
  const cancel = (o: Order) => {
    const r = window.prompt(`เหตุผลการยกเลิกออเดอร์ #${o.id.slice(0, 8)}`);
    if (r?.trim()) act(o, () => changeStatus(brandId, o.id, 'cancelled', r.trim()));
  };
  const receivePayment = (o: Order) => act(o, () => markPaid(brandId, o.id));

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      {flash && (
        <div className="alert" style={{ background: 'var(--st-completed-bg)', color: 'var(--st-completed)', border: '1px solid #bbf7d0' }}>
          🔔 มีออเดอร์ใหม่เข้ามา!
        </div>
      )}

      <div className="section-head">
        <div className="tabs">
          {['', ...ALL_STATUSES].map((f) => (
            <button key={f || 'all'} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f ? STATUS_TH[f] : 'ทั้งหมด'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: live ? 'var(--st-completed)' : 'var(--text-faint)', fontWeight: 600 }}>
            {live ? '🟢 realtime' : '⚪ offline'}
          </span>
          <button className="btn ghost sm" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻'} รีเฟรช
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ออเดอร์</th>
                <th>รายการ</th>
                <th>ยอด</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const to = nextStatus(o.status);
                const terminal = o.status === 'completed' || o.status === 'cancelled';
                return (
                  <tr key={o.id}>
                    <td className="time">
                      {new Date(o.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div className="oid" title={o.id}>#{o.id.slice(0, 8)}</div>
                      {o.cancelReason && <div className="reason">เหตุ: {o.cancelReason}</div>}
                    </td>
                    <td>
                      <div className="items-list">
                        {o.items.map((it) => (
                          <span key={it.id} className="item-line">
                            {it.nameSnapshot} <span className="item-qty">×{it.qty}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="total">{baht(o.total)}</div>
                      <div className="pay">{o.paymentMethod} · {o.paymentStatus}</div>
                    </td>
                    <td>
                      <span className={`pill ${o.status}`}>{STATUS_TH[o.status] || o.status}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {!terminal && to && (
                          <button className="btn primary sm" disabled={busy === o.id} onClick={() => advance(o)}>
                            → {STATUS_TH[to]}
                          </button>
                        )}
                        {o.status !== 'cancelled' &&
                          o.paymentMethod === 'cod' &&
                          o.paymentStatus !== 'paid' && (
                            <button className="btn ghost sm" disabled={busy === o.id} onClick={() => receivePayment(o)}>
                              💵 รับเงินแล้ว
                            </button>
                          )}
                        {!terminal && (
                          <button className="btn danger sm" disabled={busy === o.id} onClick={() => cancel(o)}>
                            ยกเลิก
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && orders.length === 0 && (
          <div className="state">
            <span className="emoji">🧾</span>
            ยังไม่มีออเดอร์ในหมวดนี้
          </div>
        )}
        {loading && orders.length === 0 && (
          <div className="state"><span className="spinner" /> กำลังโหลด…</div>
        )}
      </div>
    </>
  );
}
