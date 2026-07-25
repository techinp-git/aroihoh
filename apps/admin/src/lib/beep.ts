// เสียงเตือนสั้น ๆ ผ่าน Web Audio (ไม่ต้องมีไฟล์เสียง) — ใช้ร่วม Orders/KDS/Chat
// เบราว์เซอร์อาจบล็อก AudioContext ก่อนมี user gesture — try/catch เงียบ ไม่ให้พังทั้งหน้า
export function beep(freq = 880, durationMs = 180) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + durationMs / 1000);
    o.onended = () => ctx.close();
  } catch {
    /* ignore — เสียงเป็น nice-to-have */
  }
}
