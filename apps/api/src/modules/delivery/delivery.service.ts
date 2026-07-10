import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineKm, isWithinRadius } from './geo';
import { computeDeliveryFee } from './fee';
import { isAccepting, nowHHMMBangkok } from '../store/store-hours';
import type { DeliveryCheckResult } from '@aroihoh/shared';

export interface DeliveryQuote {
  kitchenId: string;
  inZone: boolean;
  distanceKm: number;
  deliveryFee?: number;
  reason?: string;
}

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  // แบรนด์อาจแชร์ครัวหลายครัว — MVP ใช้ครัวแรกที่ผูกไว้ (พร้อม fee rule ที่ active)
  private async resolveKitchen(brandId: string) {
    const link = await this.prisma.brandKitchen.findFirst({
      where: { brandId },
      include: { kitchen: { include: { feeRules: { where: { isActive: true } } } } },
    });
    if (!link) throw new NotFoundException('brand has no kitchen configured');
    return link.kitchen;
  }

  /**
   * คำนวณ quote (เขต + ค่าส่ง + kitchenId) — ใช้ทั้ง /delivery/check และตอนสร้างออเดอร์
   * รองรับกลยุทธ์ radius (Haversine) — polygon/PostGIS รอ ADR-02
   */
  async quote(
    brandId: string,
    point: { lat: number; lng: number },
  ): Promise<DeliveryQuote> {
    const kitchen = await this.resolveKitchen(brandId);

    if (kitchen.zoneType === 'polygon') {
      // TODO(ADR-02): เช็คด้วย PostGIS ST_Contains ผ่าน raw SQL
      throw new NotFoundException('polygon zone check not implemented yet (ADR-02)');
    }

    const center = { lat: kitchen.lat, lng: kitchen.lng };
    const distanceKm = haversineKm(center, point);
    const maxKm = kitchen.maxDistanceKm ?? 0;

    // US-16: พักรับออเดอร์ / นอกเวลาทำการ
    const acc = isAccepting(
      { isOpen: kitchen.isOpen, openTime: kitchen.openTime, closeTime: kitchen.closeTime },
      nowHHMMBangkok(),
    );
    if (!acc.ok) {
      return { kitchenId: kitchen.id, inZone: false, distanceKm, reason: acc.reason };
    }
    if (!isWithinRadius(center, point, maxKm)) {
      return { kitchenId: kitchen.id, inZone: false, distanceKm, reason: 'เกินระยะจัดส่ง' };
    }

    const rule = kitchen.feeRules[0];
    const fee = rule
      ? computeDeliveryFee({ type: rule.type, params: rule.params }, distanceKm)
      : 0;
    if (fee == null) {
      return {
        kitchenId: kitchen.id,
        inZone: false,
        distanceKm,
        reason: 'ไม่มีกฎค่าส่งที่ครอบระยะนี้',
      };
    }
    return { kitchenId: kitchen.id, inZone: true, distanceKm, deliveryFee: fee };
  }

  /** US-03: LIFF เรียกเช็คเขตก่อนยืนยัน (ผล check เป็นแค่ UX — server re-check ตอนสร้างออเดอร์อีกที) */
  async check(
    brandId: string,
    point: { lat: number; lng: number },
  ): Promise<DeliveryCheckResult> {
    const q = await this.quote(brandId, point);
    return {
      inZone: q.inZone,
      distanceKm: q.distanceKm,
      deliveryFee: q.deliveryFee,
      reason: q.reason,
    };
  }
}
