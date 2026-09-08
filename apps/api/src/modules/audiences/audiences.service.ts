import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveAudienceByRules,
  validateRules,
  AUDIENCE_PRESETS,
  type AudienceRules,
  type AudienceCustomer,
} from './rules';

@Injectable()
export class AudiencesService {
  constructor(private readonly prisma: PrismaService) {}

  presets() {
    return AUDIENCE_PRESETS;
  }

  // ดึงลูกค้า + ประวัติออเดอร์ (เฉพาะ field ที่ใช้ประเมินกติกา — ไม่ดึง PII)
  async brandCustomers(brandId: string): Promise<AudienceCustomer[]> {
    return this.prisma.customer.findMany({
      where: { brandId },
      select: {
        id: true,
        createdAt: true,
        tags: true,
        marketingOptedOut: true,
        pointsBalance: true, // US-57: เกณฑ์ "แต้ม ≥ N"
        orders: { select: { createdAt: true } },
      },
    });
  }

  /** ประเมิน reach ของ rules สด ณ ตอนนี้ (ยังไม่บันทึก) — เคารพ opt-out */
  async previewRules(brandId: string, rules: AudienceRules) {
    validateRules(rules);
    const customers = await this.brandCustomers(brandId);
    const matched = resolveAudienceByRules(customers, rules, Date.now());
    return {
      totalCustomers: customers.length,
      optedOut: customers.filter((c) => c.marketingOptedOut).length,
      audienceCount: matched.length,
    };
  }

  /** ประเมิน reach ของ audience ที่บันทึกไว้ (ใช้ตอนจะส่ง broadcast) */
  async previewSaved(brandId: string, audienceId: string) {
    const a = await this.get(brandId, audienceId);
    return this.previewRules(brandId, a.rules as unknown as AudienceRules);
  }

  /** คืนรายชื่อลูกค้าที่เข้ากลุ่ม (ใช้ตอนสร้าง broadcast จริง) */
  async resolveIds(brandId: string, rules: AudienceRules): Promise<string[]> {
    const customers = await this.brandCustomers(brandId);
    return resolveAudienceByRules(customers, rules, Date.now()).map((c) => c.id);
  }

  list(brandId: string) {
    return this.prisma.audience.findMany({
      where: { brandId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async get(brandId: string, id: string) {
    const a = await this.prisma.audience.findFirst({ where: { id, brandId } });
    if (!a) throw new NotFoundException('ไม่พบกลุ่มเป้าหมาย');
    return a;
  }

  create(brandId: string, adminId: string, dto: { name: string; description?: string; rules: AudienceRules }) {
    this.assertRules(dto.rules);
    return this.prisma.audience.create({
      data: {
        brandId,
        name: dto.name,
        description: dto.description,
        rules: dto.rules as object,
        createdBy: adminId,
      },
    });
  }

  async update(
    brandId: string,
    id: string,
    dto: { name?: string; description?: string; rules?: AudienceRules },
  ) {
    await this.get(brandId, id);
    if (dto.rules) this.assertRules(dto.rules);
    return this.prisma.audience.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.rules ? { rules: dto.rules as object } : {}),
      },
    });
  }

  async remove(brandId: string, id: string) {
    await this.get(brandId, id);
    await this.prisma.audience.delete({ where: { id } });
    return { deleted: true };
  }

  private assertRules(rules: AudienceRules) {
    try {
      validateRules(rules);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
