import { useEffect, useState, useCallback, useRef } from 'react';
import {
  listConversations,
  getThread,
  sendChat,
  type ChatConversation,
  type ChatThread,
} from '../api';

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

export default function Chat({ brandId }: { brandId: string }) {
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
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
        setThread(await getThread(brandId, customerId));
        loadConvs(); // อ่านแล้ว → เคลียร์ unread
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
      </div>
    </>
  );
}
