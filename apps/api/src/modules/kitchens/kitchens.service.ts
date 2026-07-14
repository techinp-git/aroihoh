import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface KitchenInput {
  name?: string;
  lat?: number;
  lng?: number;
  maxDistanceKm?: number;
  flatFee?: number; // สตางค์ — ค่าส่งแบบคงที่ (ถ้าไม่ส่ง = ไม่แตะกฎค่าส่งเดิม)
}

// US-44: จัดการครัว/location (owner) — CRUD + เขตส่ง radius + ค่าส่งแบบ flat
@Injectable()
export class KitchensService {
  constructor(private readonly prisma: PrismaService) {}

  // list แบบละเอียด (BrandManager ใช้แค่ id/name ก็ยังได้)
  async list(merchantId: string) {
    const ks = await this.prisma.kitchen.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
      include: { feeRules: { where: { isActive: true } }, brandKitchens: true },
    });
    return ks.map((k) => ({
      id: k.id,
      name: k.name,
      lat: k.lat,
      lng: k.lng,
      zoneType: k.zoneType,
      maxDistanceKm: k.maxDistanceKm,
      isOpen: k.isOpen,
      brandCount: k.brandKitchens.length,
      feeType: k.feeRules[0]?.type ?? null,
      flatFee: this.flatFeeOf(k.feeRules),
    }));
  }

  async create(merchantId: string, dto: KitchenInput) {
    return this.prisma.kitchen.create({
      data: {
        merchantId,
        name: dto.name!,
        lat: dto.lat!,
        lng: dto.lng!,
        zoneType: 'radius',
        maxDistanceKm: dto.maxDistanceKm ?? 5,
        feeRules: { create: { type: 'flat', params: { fee: dto.flatFee ?? 0 }, isActive: true } },
      },
      select: { id: true, name: true },
    });
  }

  async update(merchantId: string, id: string, dto: KitchenInput) {
    await this.assertKitchen(merchantId, id);
    await this.prisma.kitchen.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
        ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
        ...(dto.maxDistanceKm !== undefined ? { maxDistanceKm: dto.maxDistanceKm } : {}),
      },
    });
    // ตั้งค่าส่ง flat ใหม่ (ปิดกฎเดิม) เฉพาะเมื่อส่ง flatFee มา
    if (dto.flatFee !== undefined) {
      await this.prisma.deliveryFeeRule.updateMany({
        where: { kitchenId: id, isActive: true },
        data: { isActive: false },
      });
      await this.prisma.deliveryFeeRule.create({
        data: { kitchenId: id, type: 'flat', params: { fee: dto.flatFee }, isActive: true },
      });
    }
    return { ok: true };
  }

  private flatFeeOf(rules: { type: string; params: unknown }[]): number | null {
    const flat = rules.find((r) => r.type === 'flat');
    return flat ? ((flat.params as { fee?: number })?.fee ?? null) : null;
  }

  private async assertKitchen(merchantId: string, id: string) {
    const k = await this.prisma.kitchen.findFirst({ where: { id, merchantId } });
    if (!k) throw new NotFoundException('ไม่พบครัวใน merchant นี้');
  }
}
