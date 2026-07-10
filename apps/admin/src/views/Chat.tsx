import { useEffect, useState, useCallback, useRef } from 'react';
import {
  listConversations,
  getThread,
  sendChat,
  getCustomer,
  updateCustomerTags,
  baht,
  STATUS_TH,
  type ChatConversation,
  type ChatThread,
  type CustomerDetail,
} from '../api';
import { TagEditor } from '../components/Tags';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

export default function Chat({ brandId }: { brandId: string }) {
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    if (!brandId) return;
    setError('');
    try {
      setConvs(await listConversations(brandId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [brandId]);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  const openThread = useCallback(
    async (customerId: string) => {
      setSelected(customerId);
      try {
        const [t, c] = await Promise.all([
          getThread(brandId, customerId),
          getCustomer(brandId, customerId),
        ]);
        setThread(t);
        setCust(c);
        loadConvs();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [brandId, loadConvs],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const send = async () => {
    const t = text.trim();
    if (!t || !selected) return;
    setSending(true);
    setError('');
    try {
      await sendChat(brandId, selected, t);
      setText('');
      setThread(await getThread(brandId, selected));
      loadConvs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const saveTags = async (tags: string[]) => {
    if (!cust) return;
    try {
      await updateCustomerTags(brandId, cust.id, tags);
      setCust({ ...cust, tags });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="chat-wrap">
        {/* conversation list */}
        <div className="card conv-list">
          {convs.map((c) => (
            <div
              key={c.customerId}
              className={`conv-item ${selected === c.customerId ? 'active' : ''}`}
              onClick={() => openThread(c.customerId)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cname">{c.displayName || '(ไม่มีชื่อ)'}</div>
                <div className="cmsg">
                  {c.lastDirection === 'outbound' ? 'คุณ: ' : ''}
                  {c.lastMessage}
                </div>
              </div>
              {c.unread > 0 && <span className="unread">{c.unread}</span>}
            </div>
          ))}
          {convs.length === 0 && <div className="state">ยังไม่มีบทสนทนา</div>}
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
                {thread.customer.displayName || '(ไม่มีชื่อ)'}
                <div className="sub">LINE: {thread.customer.lineUserId}</div>
              </div>
              <div className="bubbles">
                {thread.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.direction === 'outbound' ? 'out' : 'in'}`}>
                    {m.text}
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
                  placeholder="พิมพ์ข้อความ… (ส่งเข้า LINE เมื่อเชื่อม SETUP-1)"
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
