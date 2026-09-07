import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { haversineKm, isWithinRadius } from './geo';
import { computeDeliveryFee } from './fee';
import { isAccepting, nowHHMMBangkok } from '../store/store-hours';
import type { DeliveryCheckResult } from '@aroihoh/shared';

/** เหตุที่สั่งไม่ได้ — แยกเป็นรหัสเพื่อให้ caller ตัดสินใจต่างกันได้ ไม่ต้องอ่านข้อความไทย */
export type DeliveryRejectCode =
  | 'store_closed' // ร้านพัก/นอกเวลา — พรุ่งนี้ก็สั่งได้ ไม่ใช่ปัญหาของที่อยู่
  | 'out_of_radius' // ไกลเกินรัศมีครัว — ที่อยู่นี้สั่งไม่ได้จริง ๆ
  | 'no_fee_rule' // ไม่มีกฎค่าส่งครอบระยะนี้ (ตั้งค่าไม่ครบ)
  | 'polygon_unsupported';

export interface DeliveryQuote {
  kitchenId: string;
  inZone: boolean;
  distanceKm: number;
  deliveryFee?: number;
  reason?: string;
  reasonCode?: DeliveryRejectCode;
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
   * จุดตั้งครัว + รัศมีส่ง — ให้ LIFF เอาไปตั้งจุดกึ่งกลางแผนที่และวาดวงเขตส่ง (US-03)
   * public ได้: เป็นที่ตั้งร้าน ไม่ใช่ข้อมูลลูกค้า · ไม่คืน fee rule (คิดเงินฝั่ง server เท่านั้น #2)
   */
  async origin(brandId: string) {
    const k = await this.resolveKitchen(brandId);
    return {
      name: k.name,
      lat: k.lat,
      lng: k.lng,
      maxDistanceKm: k.maxDistanceKm ?? 0,
    };
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
      return {
        kitchenId: kitchen.id,
        inZone: false,
        distanceKm,
        reason: acc.reason,
        reasonCode: 'store_closed',
      };
    }
    if (!isWithinRadius(center, point, maxKm)) {
      return {
        kitchenId: kitchen.id,
        inZone: false,
        distanceKm,
        reason: 'เกินระยะจัดส่ง',
        reasonCode: 'out_of_radius',
      };
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
        reasonCode: 'no_fee_rule',
      };
    }
    return { kitchenId: kitchen.id, inZone: true, distanceKm, deliveryFee: fee };
  }

  /**
   * US-58: ที่อยู่นี้ "ส่งถึงไหม" เชิงภูมิศาสตร์ล้วน — ไม่สนว่าตอนนี้ร้านเปิดหรือปิด
   * ใช้โชว์ป้าย "นอกเขตส่ง" ในสมุดที่อยู่ ไม่งั้นตอนร้านปิดหมุดทุกอันจะขึ้นนอกเขตพร้อมกัน
   * ⚠️ ห้ามใช้แทน quote() ตอนสร้างออเดอร์ — ตรงนั้นต้องเช็คเวลาทำการด้วย
   */
  async isDeliverable(brandId: string, point: { lat: number; lng: number }) {
    const q = await this.quote(brandId, point);
    return {
      deliverable: q.inZone || q.reasonCode === 'store_closed',
      distanceKm: q.distanceKm,
      deliveryFee: q.deliveryFee,
    };
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
