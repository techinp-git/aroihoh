/**
 * US-08 — Flex Message ใบยืนยันออเดอร์ + ปุ่มดูสถานะ
 *
 * pure function ล้วน (ไม่แตะ prisma/network) → ทดสอบได้โดยไม่ต้องมี LINE keys
 * กติกาเหล็ก #2: ตัวเลขทุกตัวรับมาจาก order ที่ server คำนวณแล้ว — ที่นี่แค่ "จัดรูปแบบ" ห้ามคำนวณเงินใหม่
 * PDPA #6: ใบยืนยันส่งถึงเจ้าของออเดอร์เท่านั้น ไม่ใส่เบอร์โทร/พิกัดลงในบับเบิล
 */

import { ORDER_STATUS_FLOW, type OrderStatus } from '@aroihoh/shared';

/** ป้ายสถานะภาษาไทย — ให้ตรงกับที่ admin/liff ใช้ */
export const STATUS_TH: Record<OrderStatus, string> = {
  pending: 'รอร้านยืนยัน',
  confirmed: 'ร้านรับออเดอร์แล้ว',
  preparing: 'กำลังปรุง',
  ready: 'จัดเสร็จ รอไรเดอร์',
  delivering: 'กำลังจัดส่ง',
  completed: 'ส่งสำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
};

/** สตางค์ → "60" / "1,234.50" (ตัด .00 ทิ้งให้อ่านง่ายบนมือถือ) */
export function formatBaht(satang: number): string {
  const baht = satang / 100;
  const s = baht.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

/** เลขออเดอร์แบบสั้นให้ลูกค้าอ่าน/แจ้งร้านได้ (uuid เต็มยาวเกินไป) */
export function shortOrderNo(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export interface FlexOrderItem {
  nameSnapshot: string;
  qty: number;
  lineTotal: number; // สตางค์
}

export interface FlexOrderInput {
  id: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: 'promptpay' | 'cod';
  note?: string | null;
  items: FlexOrderItem[];
}

export interface FlexBuildOpts {
  brandName: string;
  /** LIFF ID ของแบรนด์ — ใช้ทำ deep link ปุ่ม "ดูสถานะ" (ไม่มี = ซ่อนปุ่ม) */
  liffId?: string | null;
  /** สีหลักของแบรนด์ (US-39 theme) — default ส้มชิมชีวา */
  primaryColor?: string | null;
}

const DEFAULT_COLOR = '#E8590C';

/** แถวสรุปเงิน 1 บรรทัด */
function summaryRow(label: string, value: string, bold = false) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#666666', flex: 0 },
      {
        type: 'text',
        text: value,
        size: bold ? 'md' : 'sm',
        color: bold ? '#111111' : '#333333',
        align: 'end',
        weight: bold ? 'bold' : 'regular',
      },
    ],
  };
}

/** แถวรายการอาหาร — "ชื่อ ×2 … 120" */
function itemRow(it: FlexOrderItem) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${it.nameSnapshot} ×${it.qty}`, size: 'sm', color: '#333333', flex: 5, wrap: true },
      { type: 'text', text: formatBaht(it.lineTotal), size: 'sm', color: '#333333', align: 'end', flex: 2 },
    ],
  };
}

/**
 * สร้าง Flex bubble ใบยืนยันออเดอร์
 * คืน object ตาม spec LINE Flex — ผู้เรียกเอาไปห่อใน { type:'flex', altText, contents } เอง
 */
export function buildOrderConfirmFlex(order: FlexOrderInput, opts: FlexBuildOpts) {
  const color = opts.primaryColor || DEFAULT_COLOR;
  const orderNo = shortOrderNo(order.id);

  const bodyContents: unknown[] = [
    { type: 'text', text: `ออเดอร์ #${orderNo}`, weight: 'bold', size: 'lg', color: '#111111' },
    { type: 'text', text: STATUS_TH[order.status], size: 'sm', color, margin: 'xs' },
    { type: 'separator', margin: 'lg' },
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: order.items.map(itemRow) },
    { type: 'separator', margin: 'lg' },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      spacing: 'sm',
      contents: [
        summaryRow('ค่าอาหาร', formatBaht(order.subtotal)),
        summaryRow('ค่าส่ง', order.deliveryFee > 0 ? formatBaht(order.deliveryFee) : 'ฟรี'),
        ...(order.discount > 0 ? [summaryRow('ส่วนลด', `-${formatBaht(order.discount)}`)] : []),
        summaryRow('รวมทั้งสิ้น', `${formatBaht(order.total)} ฿`, true),
      ],
    },
    {
      type: 'text',
      text: order.paymentMethod === 'cod' ? '💵 เก็บเงินปลายทาง' : '📱 ชำระผ่าน PromptPay',
      size: 'xs',
      color: '#888888',
      margin: 'lg',
    },
  ];

  if (order.note) {
    bodyContents.push({ type: 'text', text: `📝 ${order.note}`, size: 'xs', color: '#888888', wrap: true, margin: 'sm' });
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: color,
      paddingAll: 'lg',
      contents: [{ type: 'text', text: opts.brandName, weight: 'bold', color: '#FFFFFF', size: 'md', wrap: true }],
    },
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
  };

  // ปุ่มดูสถานะ — ต้องมี liffId ถึงจะ deep link กลับเข้า LIFF ได้
  if (opts.liffId) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color,
          height: 'sm',
          action: { type: 'uri', label: 'ดูสถานะออเดอร์', uri: `https://liff.line.me/${opts.liffId}?orderId=${order.id}` },
        },
      ],
    };
  }

  return bubble;
}

/** ข้อความสำรองเวลาอุปกรณ์แสดง Flex ไม่ได้ (altText) — LINE จำกัด 400 ตัวอักษร */
export function orderConfirmAltText(order: FlexOrderInput): string {
  return `ออเดอร์ #${shortOrderNo(order.id)} · ${STATUS_TH[order.status]} · รวม ${formatBaht(order.total)} ฿`.slice(0, 400);
}

/** ข้อความอัปเดตสถานะ (ใช้กับ push สั้น ๆ ไม่ต้อง Flex เต็มใบ — US-09) */
export function statusUpdateText(order: Pick<FlexOrderInput, 'id' | 'status'>, brandName: string): string {
  const label = STATUS_TH[order.status];
  const no = shortOrderNo(order.id);
  if (order.status === 'cancelled') return `${brandName}\nออเดอร์ #${no} ถูกยกเลิกแล้ว 🙏`;
  if (order.status === 'completed') return `${brandName}\nออเดอร์ #${no} ส่งสำเร็จแล้ว ขอบคุณครับ 🙏`;
  return `${brandName}\nออเดอร์ #${no} — ${label}`;
}

/** สถานะที่ควรแจ้งลูกค้า (ไม่ต้องยิงทุก transition ให้เปลืองโควตา) */
export const NOTIFY_STATUSES: readonly OrderStatus[] = ['confirmed', 'delivering', 'completed', 'cancelled'];

export function shouldNotify(status: OrderStatus): boolean {
  return NOTIFY_STATUSES.includes(status);
}

/** guard: สถานะที่รู้จักทั้งหมด (กันค่าหลุดจาก DB enum ใหม่) */
export function isKnownStatus(s: string): s is OrderStatus {
  return s === 'cancelled' || (ORDER_STATUS_FLOW as readonly string[]).includes(s);
}
