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
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly events: OrderEventsService,
  ) {}

  private readonly orderInclude = { items: true } satisfies Prisma.OrderInclude;

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

    // 2) server-side re-check เขต + ค่าส่ง (กติกาเหล็ก #5)
    const quote = await this.delivery.quote(brandId, {
      lat: dto.deliveryAddress.lat,
      lng: dto.deliveryAddress.lng,
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
        qty: i.qty,
        lineTotal: m.price * i.qty,
        note: i.note,
      };
    });

    // 4) คิดยอดฝั่ง server
    const pricing = computeOrderPricing(orderItems, deliveryFee, 0);

    // 5) เขียน order + address + items แบบ atomic (nested create). กัน race ที่ idempotencyKey ด้วย unique
    try {
      const created = await this.prisma.order.create({
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
          address: {
            create: {
              customer: { connect: { id: customerId } },
              label: dto.deliveryAddress.label,
              detail: dto.deliveryAddress.detail,
              lat: dto.deliveryAddress.lat,
              lng: dto.deliveryAddress.lng,
            },
          },
          items: { create: orderItems },
        },
        include: this.orderInclude,
      });
      // US-11: push realtime ให้ admin
      this.events.emit({
        brandId,
        type: 'created',
        orderId: created.id,
        total: created.total,
      });
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: { status: to, ...(to === 'cancelled' ? { cancelReason: reason } : {}) },
        include: this.orderInclude,
      });
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
    return updated;
  }
}
