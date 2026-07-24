import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from './line.client';
import { encryptSecret as encrypt } from '../../common/crypto'; // SEC-1: AES-256-GCM at-rest
import { buildRichMenu, validateRichMenu, RICH_MENU_WIDTH, RICH_MENU_HEIGHT_TALL } from './richmenu'; // US-10
import { resolveLoginChannelId } from '../auth/login-channel';

@Injectable()
export class LineConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineClient,
  ) {}

  private webhookBase() {
    return (process.env.PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  /** สถานะการเชื่อม LINE ของแบรนด์ — ไม่คืน secret/token ดิบ (แสดงแค่ว่าตั้งไว้แล้วหรือยัง) */
  async get(brandId: string) {
    const b = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        lineChannelId: true,
        lineLoginChannelId: true,
        liffId: true,
        lineChannelSecretEnc: true,
        lineChannelTokenEnc: true,
      },
    });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');
    const hasSecret = !!b.lineChannelSecretEnc;
    const hasToken = !!b.lineChannelTokenEnc;
    return {
      channelId: b.lineChannelId || '',
      loginChannelId: b.lineLoginChannelId || '',
      // เลขที่จะถูกใช้ verify จริง (ว่างไว้ = เดาจาก LIFF ID ให้) — โชว์ให้ owner เห็นจะได้ไม่งง
      effectiveLoginChannelId: resolveLoginChannelId(b) || '',
      liffId: b.liffId || '',
      hasChannelSecret: hasSecret,
      hasAccessToken: hasToken,
      configured: !!(b.lineChannelId && hasSecret && hasToken),
      webhookUrl: `${this.webhookBase()}/api/line/webhook/${brandId}`,
    };
  }

  /**
   * อัปเดต config — เฉพาะ field ที่ส่งค่ามา (secret/token: ส่งค่าใหม่ = แทนที่, ไม่ส่ง = คงเดิม)
   * ส่ง null มาชัดเจน = ล้างค่า
   */
  async update(
    brandId: string,
    dto: {
      channelId?: string;
      loginChannelId?: string;
      liffId?: string;
      channelSecret?: string | null;
      channelAccessToken?: string | null;
    },
  ) {
    const b = await this.prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');

    const data: Record<string, string | null> = {};
    if (dto.channelId !== undefined) data.lineChannelId = dto.channelId.trim() || null;
    if (dto.loginChannelId !== undefined)
      data.lineLoginChannelId = dto.loginChannelId.trim() || null;
    if (dto.liffId !== undefined) data.liffId = dto.liffId.trim() || null;
    if (dto.channelSecret !== undefined)
      data.lineChannelSecretEnc = dto.channelSecret ? encrypt(dto.channelSecret.trim()) : null;
    if (dto.channelAccessToken !== undefined)
      data.lineChannelTokenEnc = dto.channelAccessToken ? encrypt(dto.channelAccessToken.trim()) : null;

    await this.prisma.brand.update({ where: { id: brandId }, data });
    return this.get(brandId);
  }

  /** ทดสอบว่า access token ใช้ได้จริงไหม — เรียก LINE /bot/info */
  async test(brandId: string) {
    return this.line.getBotInfo(brandId);
  }

  /** US-10: ดูตัวอย่าง Rich Menu ที่จะสร้าง (ไม่ยิง LINE) — เอาไว้ตรวจ layout ก่อนใช้จริง */
  async previewRichMenu(brandId: string) {
    const b = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { name: true, liffId: true, richMenuId: true },
    });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');
    const menu = buildRichMenu({ liffId: b.liffId, brandName: b.name });
    const check = validateRichMenu(menu);
    return {
      currentRichMenuId: b.richMenuId,
      hasLiff: !!b.liffId,
      // ยังไม่มี LIFF = เมนูจะตกไปใช้ปุ่มส่งข้อความ ควรเตือน owner ก่อนสร้าง
      warning: b.liffId ? undefined : 'ยังไม่ได้ตั้ง LIFF ID — ปุ่มสั่งอาหารจะใช้การส่งข้อความแทน deep link',
      valid: check.ok,
      errors: check.errors,
      menu,
      imageSpec: {
        width: RICH_MENU_WIDTH,
        height: RICH_MENU_HEIGHT_TALL,
        maxBytes: 1024 * 1024,
        formats: ['image/jpeg', 'image/png'],
      },
    };
  }

  /**
   * US-10: สร้าง Rich Menu + อัปโหลดรูป + ตั้งเป็นเมนูเริ่มต้น
   * ลบตัวเก่าทิ้งหลังตั้งตัวใหม่สำเร็จ (โควตา LINE 1000 เมนู/channel)
   * ถ้าอัปโหลดรูปพัง → ลบเมนูที่เพิ่งสร้างทิ้ง ไม่ทิ้งขยะไว้ที่ LINE
   */
  async applyRichMenu(brandId: string, imageUrl: string) {
    const b = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { name: true, liffId: true, richMenuId: true },
    });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');

    const menu = buildRichMenu({ liffId: b.liffId, brandName: b.name });
    const check = validateRichMenu(menu);
    if (!check.ok) throw new BadRequestException(`Rich Menu ไม่ถูกต้อง: ${check.errors.join(', ')}`);

    const created = await this.line.createRichMenu(brandId, menu);
    if (!created.ok || !created.richMenuId) {
      throw new BadRequestException(created.error ?? 'สร้าง Rich Menu ไม่สำเร็จ');
    }

    const uploaded = await this.line.uploadRichMenuImage(brandId, created.richMenuId, imageUrl);
    if (!uploaded.ok) {
      await this.line.deleteRichMenu(brandId, created.richMenuId); // ไม่ทิ้งเมนูไร้รูปค้างไว้
      throw new BadRequestException(uploaded.error ?? 'อัปโหลดรูปไม่สำเร็จ');
    }

    const applied = await this.line.setDefaultRichMenu(brandId, created.richMenuId);
    if (!applied.ok) {
      await this.line.deleteRichMenu(brandId, created.richMenuId);
      throw new BadRequestException(applied.error ?? 'ตั้งเมนูเริ่มต้นไม่สำเร็จ');
    }

    // สำเร็จแล้วค่อยลบตัวเก่า (ถ้าลบก่อนแล้วตัวใหม่พัง ลูกค้าจะไม่มีเมนูเลย)
    if (b.richMenuId) await this.line.deleteRichMenu(brandId, b.richMenuId);

    await this.prisma.brand.update({ where: { id: brandId }, data: { richMenuId: created.richMenuId } });
    return { ok: true, richMenuId: created.richMenuId, replaced: b.richMenuId ?? null };
  }
}
