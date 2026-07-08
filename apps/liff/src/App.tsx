import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { ORDER_STATUS_FLOW } from '@aroihoh/shared';

// US-01: เปิด LIFF + ล็อกอินอัตโนมัติ — จะ init ได้จริงเมื่อ SETUP-1 เสร็จ (มี VITE_LIFF_ID)
const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

export default function App() {
  const [status, setStatus] = useState('ยังไม่ได้ตั้งค่า LIFF_ID (รอ SETUP-1)');

  useEffect(() => {
    if (!LIFF_ID) return;
    liff
      .init({ liffId: LIFF_ID })
      .then(() => setStatus(liff.isLoggedIn() ? 'ล็อกอินแล้ว' : 'ยังไม่ล็อกอิน'))
      .catch((e) => setStatus(`liff.init ล้มเหลว: ${e.message}`));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>AroiHoh 🍚</h1>
      <p>LIFF: {status}</p>
      <p>สถานะออเดอร์ในระบบ: {ORDER_STATUS_FLOW.join(' → ')}</p>
    </main>
  );
}
