import {
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from '../delivery/delivery.service';
import { computeOrderPricing } from './pricing';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
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

    // 1) idempotency: ถ้าเคยสร้างด้วย key นี้แล้ว คืนตัวเดิม
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: this.orderInclude,
    });
    if (existing) return existing;

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
      return await this.prisma.order.create({
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
    } catch (e) {
      // สอง request ยิง key เดียวกันพร้อมกัน → unique violation → คืนตัวที่สร้างสำเร็จ
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.order.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: this.orderInclude,
        });
        if (winner) return winner;
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
}
