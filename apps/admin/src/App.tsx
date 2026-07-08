import { ORDER_STATUS_FLOW } from '@aroihoh/shared';

export default function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>AroiHoh Admin 🛠️</h1>
      <p>Dashboard วันนี้ (US-13) — โครงรอพัฒนา</p>
      <p>ลำดับสถานะออเดอร์: {ORDER_STATUS_FLOW.join(' → ')}</p>
    </main>
  );
}
