/**
 * ข้อความแทนสำหรับ message ที่ไม่ใช่ text — โชว์ในลิสต์ห้องแชต/ตัวอย่างข้อความล่าสุด
 * (LINE ส่ง sticker/location/image/… มา ไม่มี text ให้โชว์)
 */
export function inboundPlaceholder(messageType: string): string {
  switch (messageType) {
    case 'image':
      return '[รูปภาพ]';
    case 'sticker':
      return '[สติกเกอร์]';
    case 'location':
      return '[ตำแหน่งที่ตั้ง]';
    case 'video':
      return '[วิดีโอ]';
    case 'audio':
      return '[เสียง]';
    case 'file':
      return '[ไฟล์]';
    default:
      return '[ข้อความ]';
  }
}

/** ตัวอย่างข้อความล่าสุดในลิสต์ห้อง — รูปไม่มี text ให้โชว์ป้ายแทน */
export function conversationPreview(text: string, imagePath: string | null): string {
  if (imagePath) return '[รูปภาพ]';
  return text;
}
