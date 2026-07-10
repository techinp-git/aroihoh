import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';
import {
  BRAND_ID,
  setToken,
  devLogin,
  lineLogin,
  getMenu,
  checkDelivery,
  createOrder,
  getOrder,
  baht,
  type MenuCategory,
  type MenuItem,
  type DeliveryCheck,
  type OrderResult,
} from './api';

type View = 'boot' | 'error' | 'menu' | 'cart' | 'checkout' | 'done' | 'track';

const STATUS_TH: Record<string, string> = {
  pending: 'รอยืนยัน', confirmed: 'ร้านรับออเดอร์', preparing: 'กำลังทำอาหาร',
  delivering: 'กำลังจัดส่ง', completed: 'ส่งสำเร็จ', cancelled: 'ยกเลิก',
};
const PRESETS = [
  { key: 'in', label: 'ในเขต (อโศก)', lat: 13.7400, lng: 100.5620 },
  { key: 'out', label: 'นอกเขต (ไกล)', lat: 13.9000, lng: 100.6000 },
];
const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

interface CartLine { item: MenuItem; qty: number; }

export default function App() {
  const [view, setView] = useState<View>('boot');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [note, setNote] = useState('');

  // checkout
  const [preset, setPreset] = useState('in');
  const [addr, setAddr] = useState({ lat: 13.74, lng: 100.562, detail: '' });
  const [zone, setZone] = useState<DeliveryCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);

  useEffect(() => {
    (async () => {
      if (!BRAND_ID) {
        setError('ไม่พบร้าน (brandId) — กรุณาเปิดผ่าน LINE OA');
        setView('error');
        return;
      }
      try {
        if (LIFF_ID) {
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) return liff.login();
          const r = await lineLogin(liff.getIDToken() || '');
          setToken(r.accessToken);
        } else {
          const r = await devLogin(); // dev: ไม่ต้องมี LINE
          setToken(r.accessToken);
        }
        setMenu(await getMenu());
        setView('menu');
      } catch (e) {
        setError((e as Error).message);
        setView('error');
      }
    })();
  }, []);

  // auto-refresh สถานะระหว่างติดตาม (US-11 ฝั่งลูกค้า)
  useEffect(() => {
    if (view !== 'track' || !order) return;
    const id = setInterval(() => {
      getOrder(order.id).then(setOrder).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [view, order?.id]);

  const lines = Object.values(cart).filter((l) => l.qty > 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.item.price * l.qty, 0);

  const setQty = (item: MenuItem, qty: number) =>
    setCart((c) => ({ ...c, [item.id]: { item, qty: Math.max(0, qty) } }));

  const runCheck = async () => {
    setChecking(true);
    setZone(null);
    setError('');
    try {
      setZone(await checkDelivery(addr.lat, addr.lng));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const place = async () => {
    setPlacing(true);
    setError('');
    try {
      const res = await createOrder({
        idempotencyKey: crypto.randomUUID(),
        items: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
        deliveryAddress: { detail: addr.detail || 'ที่อยู่ลูกค้า', lat: addr.lat, lng: addr.lng },
        paymentMethod: 'cod',
        note: note || undefined,
      });
      setOrder(res);
      setView('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlacing(false);
    }
  };

  const refreshOrder = async () => {
    if (!order) return;
    try {
      setOrder(await getOrder(order.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── render ──
  if (view === 'boot')
    return <div className="app"><div className="center"><div className="spinner" /></div></div>;

  if (view === 'error')
    return (
      <div className="app">
        <Header title="ชิมชีวา" />
        <div className="center">
          <div><div style={{ fontSize: 40 }}>😕</div><p>{error}</p></div>
        </div>
      </div>
    );

  return (
    <div className="app">
      <Header
        title="ชิมชีวา One Price 60"
        sub={view === 'menu' ? 'เลือกเมนู' : undefined}
        onBack={view === 'cart' ? () => setView('menu') : view === 'checkout' ? () => setView('cart') : undefined}
      />

      <div className="body">
        {error && <div className="alert">{error}</div>}

        {/* MENU */}
        {view === 'menu' &&
          menu.map((cat) => (
            <div key={cat.id}>
              <div className="cat-title">{cat.name}</div>
              {cat.items.map((it) => {
                const q = cart[it.id]?.qty ?? 0;
                return (
                  <div className="item" key={it.id}>
                    <div className="info">
                      <div className="name">{it.name}</div>
                      {it.description && <div className="desc">{it.description}</div>}
                      <div className="price">{baht(it.price)}</div>
                    </div>
                    <div className="stepper">
                      {q > 0 && <button onClick={() => setQty(it, q - 1)}>−</button>}
                      {q > 0 && <span className="qn">{q}</span>}
                      <button className="add" onClick={() => setQty(it, q + 1)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

        {/* CART */}
        {view === 'cart' && (
          <div className="card">
            <h3>ตะกร้าของคุณ</h3>
            {lines.map((l) => (
              <div className="cart-item" key={l.item.id}>
                <div><div className="cn">{l.item.name}</div><div className="desc">{baht(l.item.price)}</div></div>
                <div className="stepper">
                  <button onClick={() => setQty(l.item, l.qty - 1)}>−</button>
                  <span className="qn">{l.qty}</span>
                  <button className="add" onClick={() => setQty(l.item, l.qty + 1)}>+</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <label className="fld">หมายเหตุถึงร้าน</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก" />
            </div>
            <div className="line total"><span>รวมค่าอาหาร</span><span>{baht(subtotal)}</span></div>
          </div>
        )}

        {/* CHECKOUT */}
        {view === 'checkout' && (
          <>
            <div className="card">
              <h3>ที่อยู่จัดส่ง</h3>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    className={`preset ${preset === p.key ? 'on' : ''}`}
                    onClick={() => { setPreset(p.key); setAddr((a) => ({ ...a, lat: p.lat, lng: p.lng })); setZone(null); }}
                  >{p.label}</button>
                ))}
              </div>
              <label className="fld">รายละเอียดที่อยู่</label>
              <input value={addr.detail} onChange={(e) => setAddr({ ...addr, detail: e.target.value })} placeholder="บ้านเลขที่ / คอนโด / จุดสังเกต" />
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={runCheck} disabled={checking}>
                  {checking ? <div className="spinner" /> : '📍 เช็คระยะ + ค่าส่ง'}
                </button>
              </div>
              {zone && zone.inZone && (
                <div className="zone-ok" style={{ marginTop: 10 }}>
                  ✅ อยู่ในเขต · ค่าส่ง {baht(zone.deliveryFee ?? 0)} ({zone.distanceKm?.toFixed(1)} กม.)
                </div>
              )}
              {zone && !zone.inZone && (
                <div className="zone-bad" style={{ marginTop: 10 }}>❌ {zone.reason || 'อยู่นอกเขตจัดส่ง'}</div>
              )}
            </div>

            {zone?.inZone && (
              <div className="card">
                <h3>สรุปรายการ</h3>
                <div className="line"><span>ค่าอาหาร</span><span>{baht(subtotal)}</span></div>
                <div className="line"><span>ค่าส่ง</span><span>{baht(zone.deliveryFee ?? 0)}</span></div>
                <div className="line total"><span>รวมทั้งหมด</span><span>{baht(subtotal + (zone.deliveryFee ?? 0))}</span></div>
                <div className="line"><span>ชำระเงิน</span><span>เก็บเงินปลายทาง (COD)</span></div>
              </div>
            )}
          </>
        )}

        {/* DONE */}
        {view === 'done' && order && (
          <>
            <div className="done-hero">
              <div className="emoji">🎉</div>
              <h2>สั่งซื้อสำเร็จ!</h2>
              <div className="oid">เลขออเดอร์ #{order.id.slice(0, 8)}</div>
            </div>
            <div className="card">
              <div className="line total"><span>ยอดรวม</span><span>{baht(order.total)}</span></div>
              <div className="line"><span>ชำระ</span><span>เก็บเงินปลายทาง</span></div>
            </div>
          </>
        )}

        {/* TRACK */}
        {view === 'track' && order && (
          <div className="card">
            <h3>สถานะออเดอร์ #{order.id.slice(0, 8)}</h3>
            {order.status === 'cancelled' ? (
              <div className="zone-bad">ออเดอร์ถูกยกเลิก{order.cancelReason ? ` — ${order.cancelReason}` : ''}</div>
            ) : (
              <ul className="timeline">
                {ORDER_STATUS_FLOW.map((s) => {
                  const cur = ORDER_STATUS_FLOW.indexOf(order.status as any);
                  const idx = ORDER_STATUS_FLOW.indexOf(s);
                  const cls = idx < cur ? 'done' : idx === cur ? 'current' : '';
                  return (
                    <li key={s} className={cls}>
                      <span className="dot">{idx <= cur ? '✓' : ''}</span>
                      {STATUS_TH[s]}
                    </li>
                  );
                })}
              </ul>
            )}
            <button className="btn ghost" onClick={refreshOrder} style={{ marginTop: 8 }}>↻ รีเฟรชสถานะ</button>
          </div>
        )}
      </div>

      {/* bottom action bars */}
      {view === 'menu' && count > 0 && (
        <div className="cartbar">
          <button className="btn primary" onClick={() => setView('cart')}>
            <span className="badge">{count}</span> ดูตะกร้า · {baht(subtotal)}
          </button>
        </div>
      )}
      {view === 'cart' && (
        <div className="cartbar">
          <button className="btn primary" onClick={() => setView('checkout')} disabled={count === 0}>เลือกที่อยู่จัดส่ง</button>
        </div>
      )}
      {view === 'checkout' && (
        <div className="cartbar">
          <button className="btn primary" onClick={place} disabled={!zone?.inZone || placing}>
            {placing ? <div className="spinner" /> : `ยืนยันสั่ง · ${baht(subtotal + (zone?.deliveryFee ?? 0))}`}
          </button>
        </div>
      )}
      {view === 'done' && (
        <div className="cartbar">
          <button className="btn primary" onClick={() => setView('track')}>ติดตามสถานะ</button>
        </div>
      )}
    </div>
  );
}

function Header({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  return (
    <div className="hdr">
      {onBack ? <button className="back" onClick={onBack}>‹ กลับ</button> : <span className="logo">🍚</span>}
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
