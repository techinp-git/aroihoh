/**
 * PDPA: ข้อความการตลาดทุกฉบับต้องบอกวิธีปฏิเสธ — pure logic (เทสต์ได้โดยไม่ต้องมี LINE keys)
 *
 * กฎหมายให้ผู้รับต้องออกจากรายชื่อได้ง่าย จึงต่อท้ายทุก broadcast อัตโนมัติ
 * ไม่ปล่อยให้ขึ้นกับว่าคนเขียนข้อความจะจำใส่เองไหม
 */

/** คำที่ลูกค้าพิมพ์แล้วถือว่าขอออกจากรายชื่อข่าวสาร */
const STOP_WORDS = [
  'หยุดข่าวสาร',
  'ยกเลิกข่าวสาร',
  'เลิกรับข่าวสาร',
  'ไม่รับข่าวสาร',
  'unsubscribe',
  'stop',
];

/** ข้อความนี้เป็นคำขอออกจากรายชื่อไหม (ตัดช่องว่าง/ตัวพิมพ์ใหญ่ก่อนเทียบ) */
export function isUnsubscribeRequest(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return false;
  return STOP_WORDS.some((w) => t.includes(w.toLowerCase().replace(/\s+/g, '')));
}

export const UNSUBSCRIBE_HINT = 'ไม่อยากรับข้อความแบบนี้ พิมพ์ "หยุดข่าวสาร" ตอบกลับได้เลยครับ';
export const UNSUBSCRIBE_CONFIRM =
  'รับทราบครับ 🙏 เราจะไม่ส่งข่าวสารและโปรโมชันหาคุณอีก\n' +
  'คุณยังสั่งอาหารได้ตามปกติ และยังได้รับข้อความแจ้งสถานะออเดอร์อยู่\n' +
  'เปลี่ยนใจเมื่อไร เปิดกลับได้ที่หน้าโปรไฟล์ในแอป';

/** ความยาวสูงสุดของข้อความ LINE 1 ฉบับ */
const LINE_TEXT_LIMIT = 5000;

/**
 * ต่อท้ายวิธีปฏิเสธให้ข้อความการตลาด
 * - มีคำบอกวิธีปฏิเสธอยู่แล้ว → ไม่ต่อซ้ำ
 * - ต่อแล้วเกินลิมิตของ LINE → ตัดเนื้อความให้พอดี **โดยยังคงส่วนท้ายไว้เสมอ**
 *   (ยอมให้โปรโมชันขาดดีกว่าส่งข้อความที่ผิดกฎหมาย)
 */
export function withUnsubscribeHint(message: string, hint = UNSUBSCRIBE_HINT): string {
  const body = (message ?? '').trimEnd();
  if (isUnsubscribeRequest(body) || body.includes(hint)) return body;
  const suffix = `\n\n— ${hint}`;
  if (body.length + suffix.length <= LINE_TEXT_LIMIT) return body + suffix;
  return body.slice(0, LINE_TEXT_LIMIT - suffix.length).trimEnd() + suffix;
}
