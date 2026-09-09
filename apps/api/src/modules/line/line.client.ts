import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret as decrypt } from '../../common/crypto'; // SEC-1: AES-256-GCM at-rest

export interface LineConfig {
  channelSecret: string | null;
  channelAccessToken: string | null;
}

@Injectable()
export class LineClient {
  private readonly log = new Logger('LineClient');

  constructor(private readonly prisma: PrismaService) {}

  /** อ่าน config LINE ของแบรนด์ (fallback env สำหรับ dev/แบรนด์เดียว) */
  async config(brandId: string): Promise<LineConfig> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { lineChannelSecretEnc: true, lineChannelTokenEnc: true },
    });
    return {
      channelSecret: decrypt(brand?.lineChannelSecretEnc ?? null) || process.env.LINE_CHANNEL_SECRET || null,
      channelAccessToken:
        decrypt(brand?.lineChannelTokenEnc ?? null) || process.env.LINE_CHANNEL_ACCESS_TOKEN || null,
    };
  }

  /** LINE ผูกครบหรือยัง (ใช้ตัดสินใจว่าจะยิงจริงหรือ skip) */
  async isConfigured(brandId: string): Promise<boolean> {
    return !!(await this.config(brandId)).channelAccessToken;
  }

  /**
   * push ข้อความหาลูกค้า 1 คน — คืน { skipped } ถ้ายังไม่ผูก LINE (dev/ก่อน SETUP-1)
   * ยิงจริงเมื่อมี access token
   */
  async pushText(brandId: string, toLineUserId: string, text: string): Promise<{ ok: boolean; skipped?: boolean }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
      body: JSON.stringify({ to: toLineUserId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      this.log.warn(`push failed ${res.status} for brand ${brandId}`); // ห้าม log ตัว text/PII (PDPA #6)
      return { ok: false };
    }
    return { ok: true };
  }

  /**
   * US-08: push Flex message (ใบยืนยันออเดอร์) — คืน { skipped } ถ้ายังไม่ผูก LINE
   * contents = bubble จาก buildOrderConfirmFlex()
   */
  async pushFlex(
    brandId: string,
    toLineUserId: string,
    altText: string,
    contents: unknown,
  ): Promise<{ ok: boolean; skipped?: boolean }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
      body: JSON.stringify({ to: toLineUserId, messages: [{ type: 'flex', altText, contents }] }),
    });
    if (!res.ok) {
      this.log.warn(`pushFlex failed ${res.status} for brand ${brandId}`); // ห้าม log เนื้อหา/PII (PDPA #6)
      return { ok: false };
    }
    return { ok: true };
  }

  /** ดึงโปรไฟล์ลูกค้า (displayName/รูป) — คืน null ถ้ายังไม่ผูก LINE หรือดึงไม่ได้ */
  async getProfile(brandId: string, userId: string): Promise<{ displayName?: string; pictureUrl?: string } | null> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return null;
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { displayName?: string; pictureUrl?: string };
    return { displayName: j.displayName, pictureUrl: j.pictureUrl };
  }

  /**
   * ดึง binary ของ message (รูป/ไฟล์) ที่ลูกค้าส่งมา
   * ใช้ endpoint `api-data.line.me` (คนละโดเมนกับ API ปกติ — เหมือน rich menu image)
   * คืน { skipped } ถ้ายังไม่ผูก LINE · จำกัดขนาดกันไฟล์ยักษ์ (LINE รูปสูงสุด ~10MB)
   */
  async getMessageContent(
    brandId: string,
    messageId: string,
  ): Promise<{ ok: boolean; skipped?: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) {
      this.log.warn(`getMessageContent failed ${res.status} for brand ${brandId}`);
      return { ok: false, error: `LINE ตอบ ${res.status}` };
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) return { ok: false, error: 'ไฟล์ใหญ่เกิน 12MB' };
    return { ok: true, buffer, contentType };
  }

  /** ทดสอบ token: เรียก LINE /bot/info — คืนชื่อบอทถ้าใช้ได้ */
  async getBotInfo(brandId: string): Promise<{ ok: boolean; name?: string; userId?: string; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, error: 'ยังไม่ได้ตั้ง Channel access token' };
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) return { ok: false, error: `LINE ตอบกลับ ${res.status} (token อาจผิด/หมดอายุ)` };
    const j = (await res.json()) as { displayName?: string; userId?: string };
    return { ok: true, name: j.displayName, userId: j.userId };
  }

  // ─────────────────────────── Rich Menu (US-10) ───────────────────────────

  /** สร้าง rich menu (ยังไม่มีรูป) — คืน richMenuId */
  async createRichMenu(brandId: string, menu: unknown): Promise<{ ok: boolean; richMenuId?: string; error?: string; skipped?: boolean }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true, error: 'ยังไม่ได้ตั้ง Channel access token' };
    const res = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
      body: JSON.stringify(menu),
    });
    if (!res.ok) return { ok: false, error: `LINE ตอบ ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const j = (await res.json()) as { richMenuId: string };
    return { ok: true, richMenuId: j.richMenuId };
  }

  /**
   * อัปโหลดรูป rich menu จาก URL — LINE รับเฉพาะ jpeg/png ≤ 1MB ขนาดตรงสเปค
   * ใช้ endpoint api-data.line.me (คนละโดเมนกับ API ปกติ — พลาดตรงนี้บ่อย)
   */
  async uploadRichMenuImage(brandId: string, richMenuId: string, imageUrl: string): Promise<{ ok: boolean; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, error: 'ยังไม่ได้ตั้ง Channel access token' };

    const img = await fetch(imageUrl).catch(() => null);
    if (!img?.ok) return { ok: false, error: 'โหลดรูปจาก URL ไม่ได้' };
    const contentType = img.headers.get('content-type') ?? '';
    if (!/image\/(jpeg|png)/.test(contentType)) {
      return { ok: false, error: `รูปต้องเป็น jpeg/png (ได้ ${contentType || 'ไม่ทราบชนิด'})` };
    }
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.byteLength > 1024 * 1024) return { ok: false, error: 'รูปใหญ่เกิน 1MB' };

    const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${channelAccessToken}` },
      body: new Uint8Array(buf),
    });
    if (!res.ok) return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  }

  /** ตั้งเป็นเมนูเริ่มต้นของทุกคนที่เพิ่มเพื่อน */
  async setDefaultRichMenu(brandId: string, richMenuId: string): Promise<{ ok: boolean; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, error: 'ยังไม่ได้ตั้ง Channel access token' };
    const res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    return res.ok ? { ok: true } : { ok: false, error: `ตั้งเมนูเริ่มต้นไม่สำเร็จ ${res.status}` };
  }

  /** ลบ rich menu (ใช้ตอนสร้างใหม่ทับของเก่า กันเมนูค้างเต็มโควตา 1000 อัน) */
  async deleteRichMenu(brandId: string, richMenuId: string): Promise<{ ok: boolean }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false };
    const res = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    return { ok: res.ok };
  }

  /**
   * อัปโหลดรูป rich menu จาก Buffer ตรง ๆ (รูปที่ generate เอง — ไม่ต้อง host ก่อน)
   * ใช้ api-data.line.me เหมือน uploadRichMenuImage · LINE รับ jpeg/png ≤ 1MB
   */
  async uploadRichMenuImageBuffer(
    brandId: string,
    richMenuId: string,
    buf: Buffer,
    mime = 'image/png',
  ): Promise<{ ok: boolean; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, error: 'ยังไม่ได้ตั้ง Channel access token' };
    if (buf.byteLength > 1024 * 1024) return { ok: false, error: 'รูปใหญ่เกิน 1MB' };
    const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': mime, Authorization: `Bearer ${channelAccessToken}` },
      body: new Uint8Array(buf),
    });
    if (!res.ok) return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  }

  /** ผูก rich menu ให้ลูกค้า 1 คน (เมนูรายคน override default) */
  async linkUserRichMenu(
    brandId: string,
    userId: string,
    richMenuId: string,
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    return res.ok ? { ok: true } : { ok: false, error: `link ไม่สำเร็จ ${res.status}` };
  }

  /** ปลด rich menu รายคน → กลับไปใช้ default */
  async unlinkUserRichMenu(
    brandId: string,
    userId: string,
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    return res.ok ? { ok: true } : { ok: false, error: `unlink ไม่สำเร็จ ${res.status}` };
  }

  /** ผูก rich menu ให้หลายคนพร้อมกัน (chunk ละ ≤500 ตามลิมิต LINE) — คืนจำนวนที่ผูกสำเร็จ */
  async bulkLinkRichMenu(
    brandId: string,
    richMenuId: string,
    userIds: string[],
  ): Promise<{ ok: boolean; skipped?: boolean; linked: number; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true, linked: 0 };
    let linked = 0;
    for (let i = 0; i < userIds.length; i += 500) {
      const batch = userIds.slice(i, i + 500);
      const res = await fetch('https://api.line.me/v2/bot/richmenu/bulk/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
        body: JSON.stringify({ richMenuId, userIds: batch }),
      });
      if (!res.ok) return { ok: false, linked, error: `bulk link ${res.status}` };
      linked += batch.length;
    }
    return { ok: true, linked };
  }

  /** ปลด rich menu ให้หลายคนพร้อมกัน (chunk ละ ≤500) — กลับไป default */
  async bulkUnlinkRichMenu(
    brandId: string,
    userIds: string[],
  ): Promise<{ ok: boolean; skipped?: boolean; unlinked: number; error?: string }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true, unlinked: 0 };
    let unlinked = 0;
    for (let i = 0; i < userIds.length; i += 500) {
      const batch = userIds.slice(i, i + 500);
      const res = await fetch('https://api.line.me/v2/bot/richmenu/bulk/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
        body: JSON.stringify({ userIds: batch }),
      });
      if (!res.ok) return { ok: false, unlinked, error: `bulk unlink ${res.status}` };
      unlinked += batch.length;
    }
    return { ok: true, unlinked };
  }

  /** ตอบกลับด้วย replyToken (จาก webhook) — ฟรีกว่า push ไม่กินโควตา */
  async replyText(brandId: string, replyToken: string, text: string): Promise<{ ok: boolean; skipped?: boolean }> {
    const { channelAccessToken } = await this.config(brandId);
    if (!channelAccessToken) return { ok: false, skipped: true };
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channelAccessToken}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    });
    return { ok: res.ok };
  }
}
