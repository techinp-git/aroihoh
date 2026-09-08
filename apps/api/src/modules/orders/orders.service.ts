import {
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@aroihoh/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from '../delivery/delivery.service';
import { computeOrderPricing } from './pricing';
import { canTransition } from './status';
import { OrderEventsService } from './order-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { canAddSavedAddress, normalizeLabel } from '../profile/address-book';

/** ปลายทางที่ตกลงได้แล้ว ก่อนเอาไปเช็คเขต/เขียน snapshot */
interface DeliveryTarget {
  label: string | null;
  detail: string;
  note: string | null;
  lat: number;
  lng: number;
  /** มาจากหมุดในสมุด → ห้ามบันทึกซ้ำเข้าสมุดอีก */
  fromAddressBook: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly events: OrderEventsService,
    private readonly notify: NotificationsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private readonly orderInclude = { items: true } satisfies Prisma.OrderInclude;

  /**
   * US-58: หาปลายทางของออเดอร์ — จากสมุดที่อยู่ หรือหมุดที่ปักสด
   * หมุดในสมุดต้องเป็นของลูกค้า+แบรนด์นี้ และยังไม่ถูกลบ ไม่งั้น 404 (ไม่ใช่ 403 — ไม่บอกว่ามีอยู่จริง)
   */
  private async resolveDeliveryTarget(
    customerId: string,
    brandId: string,
    dto: CreateOrderDto,
  ): Promise<DeliveryTarget> {
    if (dto.savedAddressId) {
      const saved = await this.prisma.address.findFirst({
        where: {
          id: dto.savedAddressId,
          customerId,
          brandId,
          isSaved: true,
          deletedAt: null,
        },
        select: { label: true, detail: true, note: true, lat: true, lng: true },
      });
      if (!saved) throw new NotFoundException('ไม่พบที่อยู่ที่บันทึกไว้');
      return { ...saved, fromAddressBook: true };
    }
    if (dto.deliveryAddress) {
      const a = dto.deliveryAddress;
      return {
        label: normalizeLabel(a.label),
        detail: a.detail,
        note: a.note?.trim() || null,
        lat: a.lat,
        lng: a.lng,
        fromAddressBook: false,
      };
    }
    throw new BadRequestException('ต้องระบุ savedAddressId หรือ deliveryAddress อย่างใดอย่างหนึ่ง');
  }

  /**
   * ติ๊ก "บันทึกที่อยู่นี้ไว้" ตอนเช็คเอาต์
   * สมุดเต็ม (5) = ข้ามไปเงียบ ๆ ไม่ทำให้ออเดอร์ล้ม — การสั่งอาหารสำคัญกว่าการจดที่อยู่
   * (LIFF รู้จำนวนหมุดจาก /me/profile อยู่แล้ว จึงปิดช็อยส์นี้ให้ก่อนได้)
   */
  private async saveToAddressBook(
    customerId: string,
    brandId: string,
    target: DeliveryTarget,
  ) {
    const where = { customerId, brandId, isSaved: true, deletedAt: null };
    const count = await this.prisma.address.count({ where });
    if (!canAddSavedAddress(count)) return;
    await this.prisma.address.create({
      data: {
        brandId,
        customerId,
        label: target.label,
        detail: target.detail,
        note: target.note,
        lat: target.lat,
        lng: target.lng,
        isSaved: true,
        isDefault: count === 0, // หมุดแรกเป็นหมุดหลักให้เลย
      },
    });
  }

  /**
   * US-04: ยืนยัน/สร้างออเดอร์
   *  - idempotent ด้วย idempotencyKey (กันกดซ้ำ)
   *  - server re-check เขต/ค่าส่งเสมอ (ผลจาก LIFF เป็นแค่ UX) → 422 ถ้านอกเขต
   *  - คิดเงินฝั่ง server ล้วน (ราคาเมนู snapshot จาก DB ไม่เชื่อ client)
   */
  async create(customer: { sub: string; brandId: string }, dto: CreateOrderDto) {
    const { brandId, sub: customerId } = customer;

    // 1) idempotency: คืนตัวเดิม "เฉพาะของลูกค้า+แบรนด์เดียวกัน" (กัน IDOR ข้ามคน/ข้ามแบรนด์)
    const existing = await this.prisma.order.findFirst({
      where: { idempotencyKey: dto.idempotencyKey, brandId, customerId },
      include: this.orderInclude,
    });
    if (existing) return existing;

    // US-07: ถ้าจ่าย COD แบรนด์ต้องเปิดรับ
    if (dto.paymentMethod === 'cod') {
      const brand = await this.prisma.brand.findUnique({
        where: { id: brandId },
        select: { codEnabled: true },
      });
      if (!brand?.codEnabled) {
        throw new BadRequestException('แบรนด์นี้ปิดรับเก็บเงินปลายทาง (COD)');
      }
    }

    // 2) หาปลายทาง แล้ว server-side re-check เขต + ค่าส่ง (กติกาเหล็ก #5)
    //    หมุดจากสมุดก็ต้องเช็คซ้ำ — ครัวย้าย/รัศมีเปลี่ยนได้หลังบันทึกหมุดไว้
    const target = await this.resolveDeliveryTarget(customerId, brandId, dto);
    const quote = await this.delivery.quote(brandId, {
      lat: target.lat,
      lng: target.lng,
    });
    if (!quote.inZone) {
      throw new UnprocessableEntityException({
        code: 'OUT_OF_ZONE',
        reason: quote.reason ?? 'อยู่นอกเขตจัดส่ง',
        distanceKm: quote.distanceKm,
      });
    }
    const deliveryFee = quote.deliveryFee ?? 0;

    // 3) โหลดเมนูจาก DB (กรอง brandId + เปิดขาย) — ราคามาจาก server เท่านั้น
    const ids = [...new Set(dto.items.map((i) => i.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: { brandId, id: { in: ids }, isAvailable: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    const orderItems = dto.items.map((i) => {
      const m = byId.get(i.menuItemId);
      if (!m) {
        throw new BadRequestException(
          `เมนู ${i.menuItemId} ไม่พร้อมขายหรือไม่อยู่ในแบรนด์นี้`,
        );
      }
      return {
        menuItemId: m.id,
        nameSnapshot: m.name,
        unitPrice: m.price,
        unitCost: m.costPrice, // US-19: snapshot ต้นทุน ณ ตอนสั่ง (null ถ้ายังไม่กรอก)
        qty: i.qty,
        lineTotal: m.price * i.qty,
        note: i.note,
      };
    });

    // 4) US-57: ใช้แต้มเป็นส่วนลด (ถ้าเลือกมา) — ตรวจก่อน ยังไม่ตัดแต้ม
    const subtotalBefore = orderItems.reduce((a, i) => a + i.lineTotal, 0);
    const discountPlan = dto.loyaltyRewardId
      ? await this.loyalty.planRewardDiscount(
          { customerId, brandId },
          dto.loyaltyRewardId,
          subtotalBefore,
        )
      : null;

    // 5) คิดยอดฝั่ง server (ส่วนลดมาจาก server เท่านั้น ไม่เชื่อค่าจาก client)
    const pricing = computeOrderPricing(orderItems, deliveryFee, discountPlan?.discount ?? 0);

    // 6) เขียน order + address + items แบบ atomic (nested create). กัน race ที่ idempotencyKey ด้วย unique
    //    ถ้าใช้แต้มเป็นส่วนลด ต้องตัดแต้มใน transaction เดียวกัน — ออเดอร์สำเร็จแต่แต้มไม่ถูกตัด (หรือกลับกัน) ไม่ได้
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
        data: {
          brand: { connect: { id: brandId } },
          kitchen: { connect: { id: quote.kitchenId } },
          customer: { connect: { id: customerId } },
          status: 'pending',
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'unpaid',
          subtotal: pricing.subtotal,
          deliveryFee: pricing.deliveryFee,
          discount: pricing.discount,
          total: pricing.total,
          note: dto.note,
          idempotencyKey: dto.idempotencyKey,
          // US-58: ออเดอร์ชี้ snapshot เสมอ (isSaved=false) ไม่ชี้หมุดในสมุด
          //         → ลูกค้าแก้/ลบหมุดทีหลัง ที่อยู่บนออเดอร์เก่าและใบไรเดอร์ไม่เปลี่ยน
          address: {
            create: {
              brand: { connect: { id: brandId } },
              customer: { connect: { id: customerId } },
              label: target.label,
              detail: target.detail,
              note: target.note,
              lat: target.lat,
              lng: target.lng,
            },
          },
          items: { create: orderItems },
        },
        include: this.orderInclude,
        });
        if (discountPlan) {
          await this.loyalty.consumeRewardForOrder(tx, { customerId, brandId }, discountPlan, order.id);
        }
        return order;
      });
      // US-11: push realtime ให้ admin
      this.events.emit({
        brandId,
        type: 'created',
        orderId: created.id,
        total: created.total,
      });
      // US-08/09: ส่งใบยืนยัน Flex ให้ลูกค้าผ่านคิว (dedupe confirm:orderId — กดซ้ำไม่ส่งซ้ำ)
      // ห้าม await: ลูกค้าไม่ควรรอ LINE และ push พังต้องไม่ทำให้สร้างออเดอร์พัง
      void this.notify.notifyOrderConfirmed(brandId, created.id, customerId).catch(() => undefined);
      // US-58: ติ๊ก "บันทึกที่อยู่นี้ไว้" — ทำหลังออเดอร์สำเร็จ และห้ามให้พังลามมาทำออเดอร์ล้ม
      if (dto.saveAddress && !target.fromAddressBook) {
        await this.saveToAddressBook(customerId, brandId, target).catch(() => undefined);
      }
      return created;
    } catch (e) {
      // unique violation ที่ idempotencyKey
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // คืนได้เฉพาะถ้าเป็นออเดอร์ของลูกค้า+แบรนด์เดียวกัน (race กดซ้ำ)
        const mine = await this.prisma.order.findFirst({
          where: { idempotencyKey: dto.idempotencyKey, brandId, customerId },
          include: this.orderInclude,
        });
        if (mine) return mine;
        // key ชนกับออเดอร์ของคนอื่น → ไม่รั่วข้อมูล, ให้ client สร้าง key ใหม่
        throw new ConflictException('idempotencyKey ถูกใช้ไปแล้ว');
      }
      throw e;
    }
  }

  // US-05: ลูกค้าดูออเดอร์ของตัวเอง (กรอง customerId — กันดูข้ามคน)
  async getForCustomer(customerId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: this.orderInclude,
    });
  }

  // EP-04: แอดมินดูออเดอร์ของแบรนด์ (กรอง brandId เสมอ) — filter status ได้
  listForBrand(brandId: string, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { brandId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: this.orderInclude,
    });
  }

  // US-37: จอครัว (KDS) — ออเดอร์ active ข้ามทุกแบรนด์ที่ admin คุม (order.kitchenId มีอยู่แล้ว)
  // เรียงเก่าสุดก่อน (ครัวทำตามคิว) + ติดชื่อแบรนด์ให้โชว์ป้าย
  listForKitchen(brandIds: string[]) {
    if (brandIds.length === 0) return [];
    return this.prisma.order.findMany({
      where: {
        brandId: { in: brandIds },
        status: { in: ['pending', 'confirmed', 'preparing', 'ready'] },
      },
      orderBy: { createdAt: 'asc' },
      // customer/address ไว้พิมพ์ label ไรเดอร์ (US-43) — displayName + ที่อยู่ + พิกัด (ไม่คืน phoneEnc PDPA)
      include: {
        items: true,
        brand: { select: { name: true } },
        customer: { select: { displayName: true } },
        address: { select: { detail: true, lat: true, lng: true } },
      },
    });
  }

  /**
   * US-12: เปลี่ยนสถานะออเดอร์ (แอดมิน)
   *  - ไล่ลำดับเท่านั้น (canTransition) → 409 ถ้าเปลี่ยนข้ามขั้น/ถอยหลัง/ออกจาก terminal
   *  - ยกเลิกต้องมีเหตุผล
   *  - เขียน audit log ในทรานแซกชันเดียวกับการอัปเดต
   */
  async updateStatus(
    brandId: string,
    orderId: string,
    to: OrderStatus,
    actor: { type: string; id?: string },
    reason?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, brandId },
    });
    if (!order) throw new NotFoundException('order not found');

    if (!canTransition(order.status, to)) {
      throw new ConflictException(
        `เปลี่ยนสถานะ ${order.status} → ${to} ไม่ได้ (ต้องไล่ลำดับ)`,
      );
    }
    if (to === 'cancelled' && !reason?.trim()) {
      throw new BadRequestException('การยกเลิกต้องระบุเหตุผล');
    }

    let pointsAwarded = 0;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: { status: to, ...(to === 'cancelled' ? { cancelReason: reason } : {}) },
        include: this.orderInclude,
      });
      // US-56: ส่งสำเร็จ = ให้แต้ม ใน transaction เดียวกัน
      // (ไม่ทำแบบ fire-and-forget เพราะ "ส่งของแล้วแต้มหาย" คือเรื่องที่ลูกค้าทวงจริง)
      if (to === 'completed') {
        pointsAwarded = await this.loyalty.awardForOrder(tx, {
          brandId,
          customerId: order.customerId,
          orderId,
          subtotal: order.subtotal,
          discount: order.discount,
        });
      }
      await tx.auditLog.create({
        data: {
          brandId,
          actorType: actor.type,
          actorId: actor.id,
          action: 'order.status_change',
          entityType: 'order',
          entityId: orderId,
          before: { status: order.status },
          after: { status: to, cancelReason: reason ?? null },
        },
      });
      return u;
    });
    // US-11: sync ให้ admin คนอื่นเห็นการเปลี่ยนสถานะ
    this.events.emit({ brandId, type: 'status', orderId, status: to });
    // US-09: แจ้งลูกค้าผ่านคิว (เฉพาะสถานะสำคัญ, dedupe ที่ message_logs) — ไม่ให้ push พังทำ API พัง
    void this.notify
      .notifyStatusChanged(brandId, orderId, order.customerId, to)
      .catch(() => undefined);
    // US-56: บอกลูกค้าว่าได้แต้ม — push พังต้องไม่ทำให้การเปลี่ยนสถานะพัง (แต้มลง DB ไปแล้ว)
    if (pointsAwarded > 0) {
      void this.notify
        .notifyPointsEarned(brandId, orderId, order.customerId)
        .catch(() => undefined);
    }
    return { ...updated, pointsAwarded };
  }
}
