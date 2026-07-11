import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineClient } from './line.client';

// TODO(SETUP-1/US-25): เข้ารหัส secret/token จริงก่อนเก็บ (ตอนนี้ passthrough)
const encrypt = (v: string) => v;

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
      select: { lineChannelId: true, liffId: true, lineChannelSecretEnc: true, lineChannelTokenEnc: true },
    });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');
    const hasSecret = !!b.lineChannelSecretEnc;
    const hasToken = !!b.lineChannelTokenEnc;
    return {
      channelId: b.lineChannelId || '',
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
      liffId?: string;
      channelSecret?: string | null;
      channelAccessToken?: string | null;
    },
  ) {
    const b = await this.prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!b) throw new NotFoundException('ไม่พบแบรนด์');

    const data: Record<string, string | null> = {};
    if (dto.channelId !== undefined) data.lineChannelId = dto.channelId.trim() || null;
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
}
