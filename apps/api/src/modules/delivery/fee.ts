/**
 * US-15: คำนวณค่าส่งจากกฎ flat / tiered / per_km — pure, หน่วยสตางค์
 * คืน null = ไม่มีกฎที่ครอบระยะนี้ → ถือว่าอยู่นอกเขตส่ง
 */
import type { FeeRuleType } from '@prisma/client';

export interface FeeRuleInput {
  type: FeeRuleType;
  params: unknown; // Json จาก DB
}

interface FlatParams {
  fee: number;
}
interface Tier {
  maxKm: number;
  fee: number;
}
interface TieredParams {
  tiers: Tier[];
  beyondFee?: number | null;
}
interface PerKmParams {
  baseFee: number;
  perKm: number;
  freeKm?: number;
}

export function computeDeliveryFee(
  rule: FeeRuleInput,
  distanceKm: number,
): number | null {
  const p = rule.params as Record<string, unknown>;

  switch (rule.type) {
    case 'flat':
      return Math.max(0, Math.round((p as unknown as FlatParams).fee));

    case 'per_km': {
      const { baseFee, perKm, freeKm = 0 } = p as unknown as PerKmParams;
      const chargedKm = Math.max(0, distanceKm - freeKm);
      return Math.max(0, Math.round(baseFee + Math.ceil(chargedKm) * perKm));
    }

    case 'tiered': {
      const { tiers, beyondFee = null } = p as unknown as TieredParams;
      const sorted = [...(tiers ?? [])].sort((a, b) => a.maxKm - b.maxKm);
      const hit = sorted.find((t) => distanceKm <= t.maxKm);
      if (hit) return Math.max(0, Math.round(hit.fee));
      return beyondFee == null ? null : Math.max(0, Math.round(beyondFee));
    }

    default:
      return null;
  }
}
