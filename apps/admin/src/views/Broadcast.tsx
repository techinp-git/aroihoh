import { useState } from 'react';
import Compose from './broadcast/Compose';
import ContentLib from './broadcast/ContentLib';
import Audiences from './broadcast/Audiences';

type Tab = 'compose' | 'content' | 'audiences';
const TABS: { key: Tab; label: string }[] = [
  { key: 'compose', label: '📨 ส่งข่าวสาร' },
  { key: 'content', label: '📝 คลังข้อความ' },
  { key: 'audiences', label: '🎯 กลุ่มเป้าหมาย' },
];

export default function Broadcast({ brandId }: { brandId: string }) {
  const [tab, setTab] = useState<Tab>('compose');
  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'compose' && <Compose brandId={brandId} />}
      {tab === 'content' && <ContentLib brandId={brandId} />}
      {tab === 'audiences' && <Audiences brandId={brandId} />}
    </>
  );
}
