import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_SLOTS,
  buildSlotAvailability,
  bangkokDateKey,
  bangkokInstant,
  isValidDateKey,
  isValidHHMM,
  nextBangkokDateKey,
  cutoffInstantFor,
  resolvePreorder,
  validateSlotTimes,
  type PreorderResolution,
  type SlotAvailability,
} from './preorder';
import {
  buildProductionSummary,
  type ProdOrder,
  type ProductionGroup,
  type SlotWindow,
} from './production';

/** US-22: รอบส่งล่วงหน้า D-1 — ตั้งค่า / ให้ลูกค้าเลือก / ใบสรุปยอดผลิตให้ครัว */
@Injectable()
export class PreorderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ครัวของแบรนด์ (MVP ใช้ครัวแรกที่ผูก — เหมือน store/delivery)
   * ทุกทางเข้าต้องผ่าน brandId ก่อน → กันหยิบรอบส่งของครัวคนอื่น
   */
  private async kitchenOf(brandId: string) {
    const link = await this.prisma.brandKitchen.findFirst({
      where: { brandId },
      include: { kitchen: { include: { deliverySlots: true } } },
    });
    if (!link) throw new NotFoundException('ยังไม่ได้ตั้งค่าครัว');
    return link.kitchen;
  }

  /** รอบส่งพรุ่งนี้ของแบรนด์ + สถานะปิดรับ — public (LIFF ใช้ตอนเช็คเอาต์) */
  async slotsForBrand(brandId: string, now = new Date()) {
    const k = await this.kitchenOf(brandId);
    const slots = buildSlotAvailability(k.deliverySlots, k.preorderCutoff, now);
    return {
      cutoffTime: k.preorderCutoff,
      /**
       * นาฬิกาของ server — LIFF ใช้ตัวนี้ตั้งต้นการนับถอยหลัง ไม่พึ่งนาฬิกาเครื่องลูกค้า
       * (มือถือที่ตั้งเวลาผิดจะเห็นเวลาที่เหลือผิด แล้วกดสั่งตอนปิดรับไปแล้ว)
       */
      now: now.toISOString(),
      /** พรุ่งนี้ตามเวลาไทย — LIFF เอาไปขึ้นหัวข้อ "รอบพรุ่งนี้ (22 พ.ย.)" */
      serviceDate: nextBangkokDateKey(now),
      cutoffAt: cutoffInstantFor(nextBangkokDateKey(now), k.preorderCutoff).toISOString(),
      /** รอบไหนก็ปิดหมดแล้ว → LIFF บอกว่าพรุ่งนี้ปิดรับแล้ว กลับมาสั่งคืนนี้/พรุ่งนี้ */
      closed: slots.length > 0 && slots.every((s) => s.closed),
      slots,
    };
  }

  /**
   * ตัดสินว่าสั่งรอบนี้ได้ไหม — เรียกจาก orders.service ตอนสร้างออเดอร์
   * slotId ของครัวอื่น/ปิดใช้งาน → SLOT_NOT_FOUND (ไม่บอกว่ามีอยู่จริง เหมือน loyalty US-50)
   */
  async resolveForOrder(brandId: string, slotId: string, now = new Date()): Promise<PreorderResolution> {
    const k = await this.kitchenOf(brandId);
    return resolvePreorder(k.deliverySlots, k.preorderCutoff, slotId, now);
  }

  // ─────────────────────────── ตั้งค่า (แอดมิน) ───────────────────────────

  async getSettings(brandId: string, now = new Date()) {
    const k = await this.kitchenOf(brandId);
    return {
      kitchenId: k.id,
      kitchenName: k.name,
      cutoffTime: k.preorderCutoff,
      /** ไม่มีรอบที่เปิดใช้ = ปิดสั่งล่วงหน้าโดยปริยาย (LIFF จะไม่โชว์ตัวเลือก) */
      preorderEnabled: k.deliverySlots.some((s) => s.isActive),
      serviceDate: nextBangkokDateKey(now),
      slots: k.deliverySlots
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime))
        .map((s) => ({
          id: s.id,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          sortOrder: s.sortOrder,
          isActive: s.isActive,
        })),
    };
  }

  async setCutoff(brandId: string, cutoffTime: string) {
    if (!isValidHHMM(cutoffTime)) {
      throw new BadRequestException('เวลาปิดรับไม่ถูกต้อง (HH:MM)');
    }
    const k = await this.kitchenOf(brandId);
    await this.prisma.kitchen.update({
      where: { id: k.id },
      data: { preorderCutoff: cutoffTime },
    });
    return this.getSettings(brandId);
  }

  async createSlot(
    brandId: string,
    dto: { name: string; startTime: string; endTime: string; sortOrder?: number },
  ) {
    const bad = validateSlotTimes(dto.startTime, dto.endTime);
    if (bad) throw new BadRequestException(bad);
    const k = await this.kitchenOf(brandId);
    await this.prisma.deliverySlot.create({
      data: {
        merchantId: k.merchantId,
        kitchenId: k.id,
        name: dto.name.trim(),
        startTime: dto.startTime,
        endTime: dto.endTime,
        sortOrder: dto.sortOrder ?? k.deliverySlots.length + 1,
      },
    });
    return this.getSettings(brandId);
  }

  /**
   * แก้รอบส่ง
   * ⚠️ เวลาของรอบเป็นตัวจัดกลุ่มใบสรุปยอดผลิต (ออเดอร์เก็บ scheduledAt ไม่ได้เก็บ slotId)
   * → แก้เวลาทั้งที่มีออเดอร์จองค้างอยู่ = ออเดอร์เหล่านั้นหลุดรอบ ต้องกั้นไว้ก่อน
   * (ปิดใช้งาน/เปลี่ยนชื่อ/ลำดับ ทำได้ตลอด ไม่กระทบการจัดกลุ่ม)
   */
  async updateSlot(
    brandId: string,
    slotId: string,
    dto: { name?: string; startTime?: string; endTime?: string; sortOrder?: number; isActive?: boolean },
    now = new Date(),
  ) {
    const k = await this.kitchenOf(brandId);
    const slot = k.deliverySlots.find((s) => s.id === slotId);
    if (!slot) throw new NotFoundException('ไม่พบรอบส่งนี้');

    const startTime = dto.startTime ?? slot.startTime;
    const endTime = dto.endTime ?? slot.endTime;
    const timeChanged = startTime !== slot.startTime || endTime !== slot.endTime;
    if (timeChanged) {
      const bad = validateSlotTimes(startTime, endTime);
      if (bad) throw new BadRequestException(bad);
      const booked = await this.countUpcomingInSlot(k.id, slot, now);
      if (booked > 0) {
        throw new ConflictException(
          `แก้เวลารอบนี้ยังไม่ได้ — มีออเดอร์จองไว้ ${booked} รายการ ` +
            'ถ้าแก้เวลาตอนนี้ ออเดอร์เหล่านั้นจะหลุดออกจากใบสรุปยอดผลิตของรอบ ' +
            '(ปิดใช้งานรอบนี้แล้วสร้างรอบใหม่ หรือรอให้รอบนี้ส่งจบก่อน)',
        );
      }
    }

    await this.prisma.deliverySlot.update({
      where: { id: slotId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startTime !== undefined ? { startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return this.getSettings(brandId);
  }

  /** ลบรอบ — มีออเดอร์จองค้างอยู่ให้ปิดใช้งานแทน (ข้อมูลของครัวต้องไม่หายกลางรอบ) */
  async removeSlot(brandId: string, slotId: string, now = new Date()) {
    const k = await this.kitchenOf(brandId);
    const slot = k.deliverySlots.find((s) => s.id === slotId);
    if (!slot) throw new NotFoundException('ไม่พบรอบส่งนี้');
    const booked = await this.countUpcomingInSlot(k.id, slot, now);
    if (booked > 0) {
      throw new ConflictException(
        `ลบรอบนี้ยังไม่ได้ — มีออเดอร์จองไว้ ${booked} รายการ (ปิดใช้งานรอบนี้แทน แล้วลบทีหลัง)`,
      );
    }
    await this.prisma.deliverySlot.delete({ where: { id: slotId } });
    return this.getSettings(brandId);
  }

  /**
   * มีออเดอร์ที่ยังไม่ส่งจองอยู่ "ในรอบนี้" กี่รายการ (นับตั้งแต่ต้นวันนี้ไปข้างหน้า)
   *
   * นับข้ามทุกแบรนด์ที่ใช้ครัวนี้ — ครัวเดียวกันแชร์รอบส่งกัน
   * รอบส่งเกิดซ้ำทุกวัน จึงต้องเทียบกรอบเวลาของรอบ "ตามวันของแต่ละออเดอร์"
   * (ถ้านับรวมทุกรอบ การแก้รอบเที่ยงจะถูกออเดอร์รอบเย็นกั้นไว้ทั้งที่ไม่เกี่ยวกัน)
   */
  private async countUpcomingInSlot(
    kitchenId: string,
    slot: { startTime: string; endTime: string },
    now: Date,
  ): Promise<number> {
    const from = bangkokInstant(bangkokDateKey(now), '00:00');
    const upcoming = await this.prisma.order.findMany({
      where: {
        kitchenId,
        status: { notIn: ['completed', 'cancelled'] },
        scheduledAt: { gte: from },
      },
      select: { scheduledAt: true },
    });
    return upcoming.filter((o) => {
      if (!o.scheduledAt) return false;
      const day = bangkokDateKey(o.scheduledAt);
      const at = o.scheduledAt.getTime();
      return (
        at >= bangkokInstant(day, slot.startTime).getTime() &&
        at <= bangkokInstant(day, slot.endTime).getTime()
      );
    }).length;
  }

  // ─────────────────────── ใบสรุปยอดผลิต (ครัว) ───────────────────────

  /**
   * ใบสรุปยอดผลิตของวันหนึ่ง แยกตามรอบส่ง
   *
   * ขอบเขตข้อมูล = แบรนด์ที่แอดมินคนนี้มีสิทธิ์ (เหมือน KDS US-37) เพราะครัวเดียวทำหลายแบรนด์
   * เรียกได้ตลอด ไม่ได้ล็อกให้เรียกหลัง cutoff — ครัวอยากเห็นยอดวิ่งระหว่างวัน
   * แต่คืน cutoffPassed/final มาให้ UI ติดป้ายว่ายอดยังเปลี่ยนได้
   */
  async productionSummary(
    brandIds: string[],
    opts: { date?: string; slotId?: string } = {},
    now = new Date(),
  ) {
    const date = opts.date ?? nextBangkokDateKey(now);
    if (!isValidDateKey(date)) throw new BadRequestException('วันที่ไม่ถูกต้อง (YYYY-MM-DD)');
    if (brandIds.length === 0) {
      return {
        date,
        cutoffTime: null,
        cutoffAt: null,
        cutoffPassed: false,
        final: false,
        totals: { orderCount: 0, boxCount: 0, dropCount: 0, revenue: 0 },
        groups: [] as ProductionGroup[],
      };
    }

    // รอบส่งมาจากครัวของแบรนด์แรกที่เข้าถึงได้ — ครัวเดียวแชร์รอบให้ทุกแบรนด์ (ADR-0005)
    const k = await this.kitchenOf(brandIds[0]);
    let windows: SlotWindow[] = buildSlotAvailability(
      k.deliverySlots,
      k.preorderCutoff,
      now,
      date,
    ).map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      startAt: s.startAt,
      endAt: s.endAt,
    }));
    if (opts.slotId) {
      windows = windows.filter((w) => w.id === opts.slotId);
      if (windows.length === 0) throw new NotFoundException('ไม่พบรอบส่งนี้');
    }

    // กรองออเดอร์ด้วยช่วงเวลาทั้งวัน (ตามวันไทย) ไม่ใช่แค่กรอบของรอบ
    // → ออเดอร์ที่หลุดรอบ (เจ้าของแก้เวลาหลังมีคนจอง) ยังถูกหยิบมาใส่ bucket "ไม่ตรงรอบ"
    const dayFrom = bangkokInstant(date, '00:00');
    const dayTo = new Date(bangkokInstant(date, '00:00').getTime() + 24 * 60 * 60 * 1000 - 1);
    const rows = await this.prisma.order.findMany({
      where: {
        brandId: { in: brandIds },
        status: { not: 'cancelled' }, // ยกเลิกแล้วไม่ต้องทำ (pure ก็กันอีกชั้น)
        scheduledAt: { gte: dayFrom, lte: dayTo },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        items: { select: { menuItemId: true, nameSnapshot: true, qty: true } },
        brand: { select: { name: true } },
        customer: { select: { displayName: true } },
        // ที่อยู่/พิกัดไว้จัดกลุ่มจุดส่งและพิมพ์ให้ไรเดอร์ — ไม่คืน phoneEnc (PDPA)
        address: { select: { detail: true, lat: true, lng: true } },
      },
    });

    const orders: ProdOrder[] = rows.map((o) => ({
      id: o.id,
      status: o.status,
      brandId: o.brandId,
      brandName: o.brand.name,
      customerName: o.customer.displayName,
      paymentMethod: o.paymentMethod,
      total: o.total,
      scheduledAt: o.scheduledAt,
      address: o.address
        ? { detail: o.address.detail, lat: o.address.lat, lng: o.address.lng }
        : null,
      items: o.items.map((i) => ({
        menuItemId: i.menuItemId,
        nameSnapshot: i.nameSnapshot,
        qty: i.qty,
      })),
      note: o.note,
    }));

    const groups = buildProductionSummary(orders, windows);
    const cutoffAt = cutoffInstantFor(date, k.preorderCutoff);
    const cutoffPassed = now.getTime() >= cutoffAt.getTime();
    return {
      date,
      cutoffTime: k.preorderCutoff,
      cutoffAt: cutoffAt.toISOString(),
      cutoffPassed,
      /** ยอดนิ่งแล้ว (ปิดรับแล้ว) — ครัวเริ่มผลิตตามใบนี้ได้ */
      final: cutoffPassed,
      totals: {
        orderCount: groups.reduce((a, g) => a + g.orderCount, 0),
        boxCount: groups.reduce((a, g) => a + g.boxCount, 0),
        dropCount: groups.reduce((a, g) => a + g.dropCount, 0),
        revenue: groups.reduce((a, g) => a + g.revenue, 0),
      },
      groups,
    };
  }

  /** ตั้งรอบเริ่มต้นให้ครัวที่สร้างใหม่ — ไม่งั้นสั่งล่วงหน้าไม่ได้จนเจ้าของไปตั้งเอง */
  async provisionDefaultSlots(kitchenId: string, merchantId: string) {
    await this.prisma.deliverySlot.createMany({
      data: DEFAULT_SLOTS.map((s) => ({ ...s, kitchenId, merchantId })),
    });
  }
}

export type { SlotAvailability };
