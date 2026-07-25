import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  listConversations,
  getThread,
  sendChat,
  getCustomer,
  updateCustomerTags,
  chatPresence,
  getAdminProfile,
  chatImageUrl,
  baht,
  STATUS_TH,
  type ChatConversation,
  type ChatThread,
  type CustomerDetail,
} from '../api';
import { TagEditor } from '../components/Tags';
import { Avatar, nameHue } from '../components/Avatar';
import { beep } from '../lib/beep';

const POLL_MS = 5000;
const SOUND_KEY = 'aroihoh.chatSound'; // จำค่าเปิด/ปิดเสียงข้าม refresh

// เทียบว่า thread เปลี่ยนจริงไหม — ถ้าเหมือนเดิมต้องคง object เดิมไว้
// ไม่งั้น poll ทุก 5 วิจะ re-render + เด้ง scroll ลงล่างตลอดจนอ่านข้อความเก่าไม่ได้
const sameThread = (a: ChatThread | null, b: ChatThread) =>
  !!a &&
  a.messages.length === b.messages.length &&
  a.messages[a.messages.length - 1]?.id === b.messages[b.messages.length - 1]?.id;

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

// ป้ายบอกว่าห้องนี้คุยผ่าน OA ไหน (US-40) — สีประจำแบรนด์ deterministic จากชื่อ
function BrandChip({ name }: { name: string }) {
  const hue = nameHue(name);
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 7px',
        borderRadius: 999,
        background: `hsl(${hue} 70% 92%)`,
        color: `hsl(${hue} 60% 32%)`,
        border: `1px solid hsl(${hue} 55% 78%)`,
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  );
}

// US-40: Chat Center เดียวรวมทุกแบรนด์ — ไม่ตามแบรนด์ที่เลือกด้านบน แต่ติดป้ายแบรนด์ทุกห้อง
export default function Chat() {
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [filterBrand, setFilterBrand] = useState(''); // '' = ทุกแบรนด์
  const [selected, setSelected] = useState<{ customerId: string; brandId: string } | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [viewers, setViewers] = useState<string[]>([]); // US-46: คนอื่นที่กำลังดูห้องนี้
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== '0');
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number | null>(null); // ยอด unread รอบก่อน — เพิ่มขึ้น = มีข้อความใหม่
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const myName = getAdminProfile()?.name || 'แอดมิน';

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      localStorage.setItem(SOUND_KEY, next ? '1' : '0');
      if (next) beep(660, 90); // กดเปิด = ปลุก AudioContext ด้วย user gesture + ได้ยินตัวอย่าง
      return next;
    });
  };

  const loadConvs = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const list = await listConversations(); // ทุกแบรนด์ที่มีสิทธิ์
      // เตือนเมื่อยอด unread รวมเพิ่มขึ้น = ลูกค้าทักเข้ามาใหม่ (ข้ามรอบแรกที่ยังไม่มีฐานเทียบ)
      const totalUnread = list.reduce((n, c) => n + c.unread, 0);
      const prev = prevUnreadRef.current;
      if (prev !== null && totalUnread > prev && soundRef.current) beep();
      prevUnreadRef.current = totalUnread;
      setConvs(list);
    } catch (e) {
      // poll พังชั่วคราว (เน็ตสะดุด) ไม่ต้องเด้ง error รบกวนคนตอบแชต
      if (!silent) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  // auto-refresh inbox — ลูกค้าตอบมาต้องเห็นเองโดยไม่ต้อง F5
  // (แชตยังไม่มี SSE เหมือน orders/KDS — poll ไปก่อน, หยุดตอนสลับแท็บไปแอปอื่น)
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) loadConvs(true);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) loadConvs(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadConvs]);

  // แบรนด์ที่โผล่ใน inbox (ไว้ทำตัวกรอง)
  const brands = useMemo(() => {
    const m = new Map<string, string>();
    convs.forEach((c) => m.set(c.brandId, c.brandName));
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [convs]);

  const shown = filterBrand ? convs.filter((c) => c.brandId === filterBrand) : convs;
  const totalUnread = useMemo(() => convs.reduce((n, c) => n + c.unread, 0), [convs]);

  // badge จำนวนที่ยังไม่อ่านบนแท็บเบราว์เซอร์ — เห็นแม้สลับไปแท็บอื่น · คืนค่าตอนออกจากหน้า
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, '');
    };
  }, [totalUnread]);

  const openThread = useCallback(
    async (conv: ChatConversation) => {
      setSelected({ customerId: conv.customerId, brandId: conv.brandId });
      try {
        // ห้องแชตผูกกับแบรนด์ของลูกค้าคนนั้น — ตอบกลับจะออกผ่าน OA แบรนด์นี้เสมอ
        const [t, c] = await Promise.all([
          getThread(conv.brandId, conv.customerId),
          getCustomer(conv.brandId, conv.customerId),
        ]);
        setThread(t);
        setCust(c);
        loadConvs();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [loadConvs],
  );

  // auto-refresh ห้องที่เปิดอยู่ — ข้อความใหม่โผล่เองระหว่างคุย
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const t = await getThread(selected.brandId, selected.customerId);
        if (alive) setThread((cur) => (sameThread(cur, t) ? cur : t));
      } catch {
        /* เน็ตสะดุด — รอบหน้าค่อยลองใหม่ */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // US-46: heartbeat presence ทุก 8s ระหว่างเปิดห้อง → โชว์คนอื่นที่กำลังดู
  useEffect(() => {
    if (!selected) {
      setViewers([]);
      return;
    }
    let alive = true;
    const beat = () =>
      chatPresence(selected.brandId, selected.customerId, myName)
        .then((r) => alive && setViewers(r.viewers))
        .catch(() => {});
    beat();
    const t = setInterval(beat, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selected, myName]);

  const send = async () => {
    const t = text.trim();
    if (!t || !selected) return;
    setSending(true);
    setError('');
    try {
      await sendChat(selected.brandId, selected.customerId, t);
      setText('');
      setThread(await getThread(selected.brandId, selected.customerId));
      loadConvs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const saveTags = async (tags: string[]) => {
    if (!cust || !selected) return;
    try {
      await updateCustomerTags(selected.brandId, cust.id, tags);
      setCust({ ...cust, tags });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="chat-wrap">
        {/* conversation list — inbox รวมทุกแบรนด์ */}
        <div className="card conv-list">
          {/* หัวลิสต์: ยอดที่ยังไม่อ่าน + ปุ่มเปิด/ปิดเสียงเตือน */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #eee' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              กล่องข้อความ{totalUnread > 0 && <span className="unread" style={{ marginLeft: 6 }}>{totalUnread}</span>}
            </span>
            <button
              className="btn ghost sm"
              title={soundOn ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
              onClick={toggleSound}
              style={{ padding: '2px 8px' }}
            >
              {soundOn ? '🔔' : '🔕'}
            </button>
          </div>
          {brands.length > 1 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                style={{ width: '100%', fontSize: 12 }}
              >
                <option value="">📥 ทุกแบรนด์ ({convs.length})</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({convs.filter((c) => c.brandId === b.id).length})
                  </option>
                ))}
              </select>
            </div>
          )}
          {shown.map((c) => (
            <div
              key={c.customerId}
              className={`conv-item ${selected?.customerId === c.customerId ? 'active' : ''}`}
              onClick={() => openThread(c)}
              style={{ display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <Avatar name={c.displayName} url={c.pictureUrl} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="cname" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.displayName || '(ไม่มีชื่อ)'}
                  </span>
                  <BrandChip name={c.brandName} />
                </div>
                <div className="cmsg">
                  {c.lastDirection === 'outbound' ? 'คุณ: ' : ''}
                  {c.lastMessage}
                </div>
              </div>
              {c.unread > 0 && <span className="unread">{c.unread}</span>}
            </div>
          ))}
          {shown.length === 0 && <div className="state">ยังไม่มีบทสนทนา</div>}
        </div>

        {/* thread */}
        <div className="card thread">
          {!thread ? (
            <div className="chat-empty">
              <div>
                <div style={{ fontSize: 36 }}>💬</div>
                เลือกบทสนทนาทางซ้าย
              </div>
            </div>
          ) : (
            <>
              <div className="thread-head">
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Avatar name={thread.customer.displayName} url={thread.customer.pictureUrl} size={34} />
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {thread.customer.displayName || '(ไม่มีชื่อ)'}
                    <BrandChip name={thread.customer.brand.name} />
                  </span>
                </span>
                <div className="sub">
                  คุยผ่าน OA: {thread.customer.brand.name} · LINE: {thread.customer.lineUserId}
                </div>
                {viewers.length > 0 && (
                  <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginTop: 2 }}>
                    👁 {viewers.join(', ')} กำลังดูห้องนี้อยู่
                  </div>
                )}
              </div>
              <div className="bubbles">
                {thread.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
                    {m.imagePath ? (
                      <a href={chatImageUrl(m.id)} target="_blank" rel="noreferrer">
                        <img
                          src={chatImageUrl(m.id)}
                          alt="รูปจากลูกค้า"
                          loading="lazy"
                          style={{ maxWidth: 220, maxHeight: 260, borderRadius: 10, display: 'block' }}
                        />
                      </a>
                    ) : (
                      m.text
                    )}
                    <div className="btime">{hhmm(m.createdAt)}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="composer">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder={`ตอบกลับผ่าน OA: ${thread.customer.brand.name}`}
                  disabled={sending}
                />
                <button className="btn primary" onClick={send} disabled={sending || !text.trim()}>
                  {sending ? <span className="spinner" /> : 'ส่ง'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* customer context panel */}
        <div className="card chat-side">
          {cust ? (
            <>
              <h3>แท็กลูกค้า</h3>
              <TagEditor tags={cust.tags} onChange={saveTags} />

              <h3 style={{ marginTop: 18 }}>สรุป</h3>
              <div className="mini-order"><span>ออเดอร์</span><b>{cust.orderCount}</b></div>
              <div className="mini-order"><span>ยอดใช้จ่าย</span><b>{baht(cust.totalSpent)}</b></div>

              <h3 style={{ marginTop: 18 }}>ประวัติออเดอร์</h3>
              {cust.orders.length === 0 && <div className="pay">— ยังไม่มี —</div>}
              {cust.orders.slice(0, 8).map((o) => (
                <div key={o.id} className="mini-order">
                  <span className="oid">#{o.id.slice(0, 6)}</span>
                  <span>{baht(o.total)}</span>
                  <span className={`pill ${o.status}`} style={{ fontSize: 10 }}>{STATUS_TH[o.status] || o.status}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="pay">เลือกบทสนทนาเพื่อดูข้อมูลลูกค้า</div>
          )}
        </div>
      </div>
    </>
  );
}
