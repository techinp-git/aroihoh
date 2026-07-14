import type { KitchenOrder } from '../api';

// พิมพ์ผ่าน hidden iframe — แยก style จากแอป, ไม่ต้องขอ popup
// เครื่องพิมพ์ความร้อน 80mm: เปิด Chrome ที่ครัวด้วย --kiosk-printing เพื่อพิมพ์เงียบ (ดู docs/kitchen-print.md)
export function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
  });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 800);
  win.onafterprint = cleanup;
  setTimeout(() => {
    win.focus();
    win.print();
    // สำรอง: ถ้า onafterprint ไม่ยิง (บางเบราว์เซอร์) ก็เก็บกวาด
    setTimeout(cleanup, 3000);
  }, 200);
}

const thb = (satang: number) => (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 0 });
const timeTH = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// กรอบเอกสาร 80mm — ตัวใหญ่ อ่านง่ายในครัว
const doc = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 74mm; font-family: -apple-system, "Segoe UI", "Sarabun", sans-serif; color: #000; }
  .c { text-align: center; }
  .big { font-size: 18px; font-weight: 700; }
  .xl { font-size: 22px; font-weight: 700; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .item { font-size: 17px; font-weight: 700; margin: 3px 0; }
  .muted { font-size: 12px; }
  .note { font-size: 14px; font-weight: 700; border: 1px solid #000; padding: 3px 5px; margin-top: 4px; }
  .tag { font-size: 13px; font-weight: 700; }
</style><title>${title}</title></head><body>${body}</body></html>`;

// US-42: ใบครัว — พิมพ์ตอนกด "รับออเดอร์" · เน้นเมนู/จำนวน/หมายเหตุ ตัวใหญ่
export function kitchenTicketHtml(o: KitchenOrder) {
  const items = o.items
    .map((it) => `<div class="item"><span>×${it.qty}</span>&nbsp; ${esc(it.nameSnapshot)}</div>`)
    .join('');
  const note = o.note ? `<div class="note">📝 ${esc(o.note)}</div>` : '';
  return doc('ใบครัว', `
    <div class="c tag">*** ใบครัว ***</div>
    <div class="c xl">${esc(o.brand.name)}</div>
    <div class="row"><span class="big">#${o.id.slice(0, 6)}</span><span class="muted">${timeTH(o.createdAt)}</span></div>
    <div class="hr"></div>
    ${items}
    ${note}
    <div class="hr"></div>
    <div class="muted">${o.paymentMethod === 'cod' ? 'เก็บเงินปลายทาง' : 'ชำระแล้ว'}</div>
  `);
}

// US-43: label ติดถุงไรเดอร์ — พิมพ์ตอนกด "จัดเสร็จ" · ที่อยู่/ผู้รับ/ยอดเก็บ COD
export function riderLabelHtml(o: KitchenOrder) {
  const addr = o.address
    ? `<div class="item">${esc(o.address.detail)}</div>
       <div class="muted">📍 ${o.address.lat.toFixed(5)}, ${o.address.lng.toFixed(5)}</div>`
    : '<div class="muted">— ไม่มีที่อยู่ (รับเอง) —</div>';
  const collect =
    o.paymentMethod === 'cod'
      ? `<div class="note c">เก็บเงินปลายทาง ${thb(o.total)} ฿</div>`
      : `<div class="muted c">ชำระแล้ว (${thb(o.total)} ฿)</div>`;
  return doc('ป้ายติดถุง', `
    <div class="c tag">*** ติดถุง / ไรเดอร์ ***</div>
    <div class="row"><span class="xl">#${o.id.slice(0, 6)}</span><span class="tag">${esc(o.brand.name)}</span></div>
    <div class="hr"></div>
    <div class="big">${esc(o.customer.displayName || 'ลูกค้า')}</div>
    ${addr}
    <div class="hr"></div>
    ${collect}
  `);
}
