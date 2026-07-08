import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineKm, isWithinRadius } from './geo';
import { computeDeliveryFee } from './fee';
import type { DeliveryCheckResult } from '@aroihoh/shared';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * US-03/US-04: เช็คเขตจัดส่ง + ค่าส่ง ฝั่ง server (source of truth)
   * ตอนนี้รองรับกลยุทธ์ radius (Haversine) — polygon/PostGIS รอ ADR-02
   */
  async check(
    brandId: string,
    point: { lat: number; lng: number },
  ): Promise<DeliveryCheckResult> {
    // แบรนด์อาจแชร์ครัวหลายครัว — MVP ใช้ครัวแรกที่ผูกไว้
    const link = await this.prisma.brandKitchen.findFirst({
      where: { brandId },
      include: { kitchen: { include: { feeRules: { where: { isActive: true } } } } },
    });
    if (!link) {
      throw new NotFoundException('brand has no kitchen configured');
    }
    const kitchen = link.kitchen;

    if (kitchen.zoneType === 'polygon') {
      // TODO(ADR-02): เช็คด้วย PostGIS ST_Contains ผ่าน raw SQL
      throw new NotFoundException('polygon zone check not implemented yet (ADR-02)');
    }

    const center = { lat: kitchen.lat, lng: kitchen.lng };
    const distanceKm = haversineKm(center, point);
    const maxKm = kitchen.maxDistanceKm ?? 0;

    if (!isWithinRadius(center, point, maxKm)) {
      return { inZone: false, distanceKm, reason: 'เกินระยะจัดส่ง' };
    }

    const rule = kitchen.feeRules[0];
    if (!rule) {
      return { inZone: true, distanceKm, deliveryFee: 0 };
    }

    const fee = computeDeliveryFee({ type: rule.type, params: rule.params }, distanceKm);
    if (fee == null) {
      return { inZone: false, distanceKm, reason: 'ไม่มีกฎค่าส่งที่ครอบระยะนี้' };
    }
    return { inZone: true, distanceKm, deliveryFee: fee };
  }
}
