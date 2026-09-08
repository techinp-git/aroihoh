import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';
import {
  BRAND_ID,
  DEEP_LINK_ORDER_ID,
  DEEP_LINK_VIEW,
  setToken,
  devLogin,
  lineLogin,
  getMenu,
  getBrand,
  getProfile,
  getDeliveryOrigin,
  checkDelivery,
  createOrder,
  getOrder,
  baht,
  type MenuCategory,
  type MenuItem,
  type DeliveryCheck,
  type OrderResult,
  type BrandInfo,
  type DeliveryOrigin,
  type Profile,
  type SavedAddress,
  type CreateOrderBody,
} from './api';
import AddressPicker from './AddressPicker';
import ProfileTab, { addressIcon } from './ProfileTab';

/** แท็บล่าง (US-59) — "แต้ม" โผล่เมื่อ EP-14 ลงแล้ว (profile.loyalty ไม่ใช่ null) */
type Tab = 'order' | 'points' | 'profile';
/** หน้าย่อยในแท็บสั่งอาหาร */
type View = 'menu' | 'cart' | 'checkout' | 'done' | 'track';

const STATUS_TH: Record<string, string> = {
  pending: 'รอยืนยัน', confirmed: 'ร้านรับออเดอร์', preparing: 'กำลังทำอาหาร',
  ready: 'จัดเสร็จ รอไรเดอร์', delivering: 'กำลังจัดส่ง', completed: 'ส่งสำเร็จ', cancelled: 'ยกเลิก',
};
const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

interface CartLine { item: MenuItem; qty: number; }

export default function App() {
  const [booting, setBooting] = useState(true);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');

  const [tab, setTab] = useState<Tab>('order');
  const [view, setView] = useState<View>('menu');

  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [brand, setBrand] = useState<BrandInfo | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [note, setNote] = useState('');

  // checkout
  const [addr, setAddr] = useState({ lat: 13.74, lng: 100.562, detail: '', note: '' });
  const [pickedId, setPickedId] = useState<string | null>(null); // หมุดในสมุดที่เลือกอยู่
  const [saveAddr, setSaveAddr] = useState(false);
  const [saveLabel, setSaveLabel] = useState('บ้าน'); // ป้ายของหมุดที่กดบันทึกตอนเช็คเอาต์
  const [origin, setOrigin] = useState<DeliveryOrigin | null>(null);
  const [zone, setZone] = useState<DeliveryCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);

  useEffect(() => {
    (async () => {
      if (!BRAND_ID) {
        setFatal('ไม่พบร้าน (brandId) — กรุณาเปิดผ่าน LINE OA');
        setBooting(false);
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
        // US-39 ธีมแบรนด์ + US-59 โปรไฟล์ — โหลดพร้อมกัน
        // โปรไฟล์พังไม่ควรทำให้สั่งอาหารไม่ได้ → catch เป็น null แล้วซ่อนแท็บโปรไฟล์
        const [m, b, p] = await Promise.all([
          getMenu(),
          getBrand().catch(() => null),
          getProfile().catch(() => null),
        ]);
        setMenu(m);
        setProfile(p);
        if (b) {
          setBrand(b);
          document.title = b.name;
          if (b.theme?.primaryColor) {
            document.documentElement.style.setProperty('--brand-primary', b.theme.primaryColor);
          }
        }

        // มาจากปุ่ม "ดูสถานะออเดอร์" ใน Flex → เข้าหน้าติดตามเลย ไม่ใช่หน้าเมนู
        // โหลดไม่ได้ (ออเดอร์ของคนอื่น/ถูกลบ) ก็ตกไปหน้าเมนูตามปกติ ไม่ต้องขึ้น error
        if (DEEP_LINK_ORDER_ID) {
          try {
            setOrder(await getOrder(DEEP_LINK_ORDER_ID));
            setView('track');
            setBooting(false);
            return;
          } catch {
            /* ตกไปหน้าเมนู */
          }
        }
        // US-59 deep link จาก Rich Menu: ?view=profile | ?view=points
        if (DEEP_LINK_VIEW === 'profile' && p) setTab('profile');
        else if (DEEP_LINK_VIEW === 'points' && p) setTab(p.loyalty ? 'points' : 'profile');
      } catch (e) {
        setFatal((e as Error).message);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // auto-refresh สถานะระหว่างติดตาม (US-11 ฝั่งลูกค้า)
  useEffect(() => {
    if (tab !== 'order' || view !== 'track' || !order) return;
    const id = setInterval(() => {
      getOrder(order.id).then(setOrder).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [tab, view, order?.id]);

  const lines = Object.values(cart).filter((l) => l.qty > 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.item.price * l.qty, 0);
  const savedAddrs = profile?.addresses ?? [];

  const setQty = (item: MenuItem, qty: number) =>
    setCart((c) => ({ ...c, [item.id]: { item, qty: Math.max(0, qty) } }));

  const goTab = (t: Tab) => {
    setError('');
    // สั่งจบแล้ว (done/track) การกดแท็บ "เมนู" ต้องพากลับไปเริ่มสั่งใหม่
    // ไม่ใช่ค้างหน้า "สั่งสำเร็จ" ของออเดอร์เก่า — แต่ถ้ากำลังอยู่กลางตะกร้า/เช็คเอาต์ ให้คงไว้
    if (t === 'order' && (view === 'done' || view === 'track')) setView('menu');
    setTab(t);
  };

  // โหลดจุดตั้งครัว (ใช้ทั้งเช็คเอาต์และฟอร์มที่อยู่ในโปรไฟล์)
  useEffect(() => {
    if (origin) return;
    if (tab !== 'profile' && view !== 'checkout') return;
    getDeliveryOrigin()
      .then((o) => {
        setOrigin(o);
        setAddr((a) => (a.lat === 13.74 && a.lng === 100.562 ? { ...a, lat: o.lat, lng: o.lng } : a));
      })
      .catch(() => {}); // ไม่มี origin ก็ยังปักหมุดเองได้ ไม่ต้องบล็อกการสั่ง
  }, [tab, view, origin]);

  // เข้าหน้าเช็คเอาต์ → เลือกหมุดหลักให้อัตโนมัติ (ถ้ายังส่งถึง)
  useEffect(() => {
    if (view !== 'checkout' || pickedId || savedAddrs.length === 0) return;
    const preferred = savedAddrs.find((a) => a.isDefault && a.deliverable !== false)
      ?? savedAddrs.find((a) => a.deliverable !== false);
    if (preferred) pickSaved(preferred);
  }, [view, savedAddrs.length]);

  // ขยับหมุดแล้วเช็คระยะ/ค่าส่งให้อัตโนมัติ — หน่วงไว้ ไม่ให้ยิงทุกพิกเซลตอนลาก
  // ผลที่ได้เป็นแค่ UX ตอนยืนยันออเดอร์ server เช็คซ้ำเองเสมอ (#5)
  useEffect(() => {
    if (view !== 'checkout' || tab !== 'order') return;
    setZone(null);
    setChecking(true);
    const t = setTimeout(() => {
      checkDelivery(addr.lat, addr.lng)
        .then(setZone)
        .catch((e) => setError((e as Error).message))
        .finally(() => setChecking(false));
    }, 500);
    return () => clearTimeout(t);
  }, [tab, view, addr.lat, addr.lng]);

  function pickSaved(a: SavedAddress) {
    setPickedId(a.id);
    setSaveAddr(false);
    setAddr({ lat: a.lat, lng: a.lng, detail: a.detail, note: a.note ?? '' });
  }

  /**
   * แตะแผนที่/แก้ที่อยู่ทั้งที่เลือกหมุดจากสมุดไว้ = ใช้เฉพาะออเดอร์นี้
   * ไม่ทับหมุดในสมุด (ถ้าจะแก้ถาวรให้ไปแก้ที่แท็บโปรไฟล์)
   */
  const detachFromBook = () => {
    if (pickedId === null) return;
    setPickedId(null);
    // โน้ตเป็นของหมุดในสมุด และหน้าเช็คเอาต์ไม่มีช่องให้ดู/แก้ — ปล่อยติดมาจะกลายเป็น
    // โน้ตที่ลูกค้าไม่ได้เขียนไปโผล่บนใบไรเดอร์ (และติดไปกับหมุดที่กดบันทึกใหม่ด้วย)
    setAddr((a) => ({ ...a, note: '' }));
  };

  const place = async () => {
    setPlacing(true);
    setError('');
    try {
      const base = {
        idempotencyKey: crypto.randomUUID(),
        items: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
        paymentMethod: 'cod' as const,
        note: note || undefined,
      };
      const body: CreateOrderBody = pickedId
        ? { ...base, savedAddressId: pickedId }
        : {
            ...base,
            deliveryAddress: {
              detail: addr.detail || 'ที่อยู่ลูกค้า',
              // ตั้งชื่อให้เฉพาะตอนกดบันทึกเข้าสมุด — ออเดอร์ที่ไม่บันทึกไม่ต้องมีป้าย
              label: saveAddr ? saveLabel.trim() || undefined : undefined,
              note: addr.note || undefined,
              lat: addr.lat,
              lng: addr.lng,
            },
            saveAddress: saveAddr || undefined,
          };
      const res = await createOrder(body);
      setOrder(res);
      setView('done');
      // ล้างตะกร้า/หมายเหตุ ไม่งั้นกลับไปหน้าเมนูแล้วเจอของเดิมค้างอยู่ กดสั่งซ้ำโดยไม่ตั้งใจ
      setCart({});
      setNote('');
      // เพิ่งบันทึกหมุดใหม่เข้าสมุด → ดึงโปรไฟล์ใหม่ให้ลิสต์ตรง
      if (!pickedId && saveAddr) getProfile().then(setProfile).catch(() => {});
      setSaveAddr(false);
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

  const openOrder = async (id: string) => {
    setError('');
    try {
      setOrder(await getOrder(id));
      setTab('order');
      setView('track');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── render ──
  if (booting)
    return <div className="app"><div className="center"><div className="spinner" /></div></div>;

  if (fatal)
    return (
      <div className="app">
        <Header title="ชิมชีวา" />
        <div className="center">
          <div><div style={{ fontSize: 40 }}>😕</div><p>{fatal}</p></div>
        </div>
      </div>
    );

  const inOrderTab = tab === 'order';
  const headerSub =
    tab === 'profile' ? 'โปรไฟล์ของฉัน'
    : tab === 'points' ? 'แต้มสะสม'
    : view === 'menu' ? 'เลือกเมนู'
    : undefined;

  return (
    <div className="app">
      <Header
        title={brand?.name || 'ชิมชีวา One Price 60'}
        logoUrl={brand?.logoUrl || undefined}
        sub={headerSub}
        onBack={
          !inOrderTab ? undefined
          : view === 'cart' ? () => setView('menu')
          : view === 'checkout' ? () => setView('cart')
          : view === 'track' ? () => setView('menu') // เข้าจาก deep link ก็ยังกลับไปสั่งเพิ่มได้
          : undefined
        }
      />

      <div className="body">
        {error && <div className="alert">{error}</div>}

        {/* ── แท็บโปรไฟล์ ── */}
        {tab === 'profile' && profile && (
          <ProfileTab
            profile={profile}
            origin={origin}
            onAddresses={(addresses) => setProfile({ ...profile, addresses })}
            onOpenOrder={openOrder}
            onStartOrdering={() => { setTab('order'); setView('menu'); }}
          />
        )}

        {/* ── แท็บแต้ม (EP-14) ── */}
        {tab === 'points' && profile?.loyalty && (
          <div className="card points-card">
            <div className="line total" style={{ border: 0, margin: 0, paddingTop: 0 }}>
              <span>แต้มสะสม</span>
              <span>{profile.loyalty.balance.toLocaleString('th-TH')}</span>
            </div>
            {profile.loyalty.nextReward && (
              <div className="desc">
                อีก {Math.max(0, profile.loyalty.nextReward.pointsCost - profile.loyalty.balance)} แต้ม
                แลก {profile.loyalty.nextReward.name}
              </div>
            )}
          </div>
        )}

        {/* MENU */}
        {inOrderTab && view === 'menu' &&
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
        {inOrderTab && view === 'cart' && (
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
        {inOrderTab && view === 'checkout' && (
          <>
            <div className="card">
              <h3>ที่อยู่จัดส่ง</h3>

              {/* US-59: เลือกจากสมุดที่อยู่ได้เลย ไม่ต้องปักใหม่ทุกครั้ง */}
              {savedAddrs.length > 0 && (
                <div className="chiprow">
                  {savedAddrs.map((a) => (
                    <button
                      key={a.id}
                      className={'chip' + (pickedId === a.id ? ' on' : '') + (a.deliverable === false ? ' off' : '')}
                      disabled={a.deliverable === false}
                      onClick={() => pickSaved(a)}
                    >
                      {addressIcon(a.label)} {a.label || 'ที่อยู่'}
                    </button>
                  ))}
                  <button
                    className={'chip' + (pickedId === null ? ' on' : '')}
                    onClick={detachFromBook}
                  >
                    📍 ปักหมุดใหม่
                  </button>
                </div>
              )}

              <AddressPicker
                origin={origin}
                value={{ lat: addr.lat, lng: addr.lng }}
                onChange={(p) => {
                  detachFromBook();
                  setAddr((a) => ({ ...a, lat: p.lat, lng: p.lng }));
                }}
              />

              {checking && <div className="zone-checking">กำลังคำนวณระยะจากครัว…</div>}
              {!checking && zone?.inZone && (
                <div className="zone-ok">
                  ✅ อยู่ในเขต · ห่างจากครัว {zone.distanceKm?.toFixed(1)} กม. · ค่าส่ง {baht(zone.deliveryFee ?? 0)}
                </div>
              )}
              {!checking && zone && !zone.inZone && (
                <div className="zone-bad">❌ {zone.reason || 'อยู่นอกเขตจัดส่ง'}</div>
              )}

              <label className="fld" style={{ marginTop: 12 }}>รายละเอียดที่อยู่</label>
              <input
                value={addr.detail}
                onChange={(e) => {
                  detachFromBook();
                  setAddr({ ...addr, detail: e.target.value });
                }}
                placeholder="บ้านเลขที่ / ชั้น / ห้อง / จุดสังเกตให้ไรเดอร์"
              />

              {pickedId === null && savedAddrs.length > 0 && (
                <div className="picker-note">ที่อยู่นี้ใช้เฉพาะออเดอร์นี้ — ไม่ทับที่อยู่ในสมุด</div>
              )}

              {pickedId === null && profile && savedAddrs.length < profile.addressLimit && (
                <>
                  <label className="check">
                    <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />
                    บันทึกที่อยู่นี้ไว้ใช้ครั้งหน้า
                  </label>
                  {/* ต้องตั้งชื่อตอนบันทึก ไม่งั้นชิปครั้งหน้าขึ้น "ที่อยู่" เหมือนกันหมด แยกไม่ออก */}
                  {saveAddr && (
                    <div className="chiprow" style={{ marginTop: 10 }}>
                      {['บ้าน', 'ที่ทำงาน'].map((l) => (
                        <button
                          key={l}
                          className={'chip' + (saveLabel === l ? ' on' : '')}
                          onClick={() => setSaveLabel(l)}
                        >
                          {addressIcon(l)} {l}
                        </button>
                      ))}
                      <input
                        className="chip-input"
                        value={['บ้าน', 'ที่ทำงาน'].includes(saveLabel) ? '' : saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        placeholder="ตั้งชื่อเอง"
                      />
                    </div>
                  )}
                </>
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
        {inOrderTab && view === 'done' && order && (
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
        {inOrderTab && view === 'track' && order && (
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

      {/* แถบล่าง: ปุ่มทำงานของหน้า (ถ้ามี) + แท็บ — ซ้อนกันในกล่องเดียว ไม่ต้องคำนวณ offset */}
      <div className="bottom">
        {inOrderTab && view === 'menu' && count > 0 && (
          <div className="cartbar">
            <button className="btn primary" onClick={() => setView('cart')}>
              <span className="badge">{count}</span> ดูตะกร้า · {baht(subtotal)}
            </button>
          </div>
        )}
        {inOrderTab && view === 'cart' && (
          <div className="cartbar">
            <button className="btn primary" onClick={() => setView('checkout')} disabled={count === 0}>เลือกที่อยู่จัดส่ง</button>
          </div>
        )}
        {inOrderTab && view === 'checkout' && (
          <div className="cartbar">
            <button className="btn primary" onClick={place} disabled={!zone?.inZone || placing}>
              {placing ? <div className="spinner" /> : `ยืนยันสั่ง · ${baht(subtotal + (zone?.deliveryFee ?? 0))}`}
            </button>
          </div>
        )}
        {inOrderTab && view === 'done' && (
          <div className="cartbar">
            <button className="btn primary" onClick={() => setView('track')}>ติดตามสถานะ</button>
          </div>
        )}

        {/* โปรไฟล์โหลดไม่ได้ = ไม่มีแท็บให้สลับ ซ่อนแถบไปเลย ดีกว่าโชว์ปุ่มที่กดแล้วว่าง */}
        {profile && (
          <nav className="navbar">
            <button className={'navbtn' + (tab === 'order' ? ' on' : '')} onClick={() => goTab('order')}>
              <span className="ico">🍱</span>เมนู
            </button>
            {/* แท็บ "แต้ม" ผูกกับ EP-14 — ยังไม่ลง = ไม่โชว์ ไม่ให้ลูกค้ากดเจอหน้าว่าง */}
            {profile.loyalty && (
              <button className={'navbtn' + (tab === 'points' ? ' on' : '')} onClick={() => goTab('points')}>
                <span className="ico">🎯</span>แต้ม
              </button>
            )}
            <button className={'navbtn' + (tab === 'profile' ? ' on' : '')} onClick={() => goTab('profile')}>
              <span className="ico">👤</span>โปรไฟล์
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

function Header({ title, sub, onBack, logoUrl }: { title: string; sub?: string; onBack?: () => void; logoUrl?: string }) {
  return (
    // US-39: หัวเว็บใช้สีหลักแบรนด์ (--brand-primary) + โลโก้แบรนด์ถ้ามี
    <div className="hdr" style={{ background: 'var(--brand-primary, #e8734a)' }}>
      {onBack ? (
        <button className="back" onClick={onBack}>‹ กลับ</button>
      ) : logoUrl ? (
        <img src={logoUrl} alt="" className="logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
      ) : (
        <span className="logo">🍚</span>
      )}
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
