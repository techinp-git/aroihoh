import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';

// mock deps แบบเบา ๆ เพื่อทดสอบ decision logic (idempotency / zone gating / server pricing)
function makeService(overrides: {
  existingOrder?: unknown;
  quote?: any;
  menuItems?: any[];
  createdCapture?: (data: any) => void;
  createImpl?: any;
}) {
  const prisma: any = {
    order: {
      findFirst: jest.fn().mockResolvedValue(overrides.existingOrder ?? null),
      create:
        overrides.createImpl ??
        jest.fn().mockImplementation(({ data }: any) => {
          overrides.createdCapture?.(data);
          return Promise.resolve({ id: 'order-1', ...data });
        }),
    },
    menuItem: {
      findMany: jest.fn().mockResolvedValue(overrides.menuItems ?? []),
    },
  };
  const delivery: any = {
    quote: jest.fn().mockResolvedValue(
      overrides.quote ?? { kitchenId: 'k1', inZone: true, distanceKm: 1, deliveryFee: 2000 },
    ),
  };
  return { service: new OrdersService(prisma, delivery), prisma, delivery };
}

const customer = { sub: 'cust-1', brandId: 'brand-1' };
const baseDto = {
  idempotencyKey: 'key-1',
  items: [{ menuItemId: 'm1', qty: 2 }],
  deliveryAddress: { detail: 'x', lat: 13.7, lng: 100.5 },
  paymentMethod: 'cod' as const,
};

describe('OrdersService.create', () => {
  it('idempotent: มีออเดอร์ key เดิมแล้ว → คืนตัวเดิม ไม่สร้างใหม่', async () => {
    const { service, prisma } = makeService({
      existingOrder: { id: 'old', idempotencyKey: 'key-1' },
    });
    const res = await service.create(customer, baseDto);
    expect(res).toEqual({ id: 'old', idempotencyKey: 'key-1' });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('นอกเขต → 422 ไม่สร้างออเดอร์', async () => {
    const { service, prisma } = makeService({
      quote: { kitchenId: 'k1', inZone: false, distanceKm: 9, reason: 'เกินระยะจัดส่ง' },
    });
    await expect(service.create(customer, baseDto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('คิดเงินฝั่ง server จากราคาใน DB (ไม่เชื่อ client) + บวกค่าส่ง', async () => {
    let captured: any;
    const { service } = makeService({
      menuItems: [{ id: 'm1', name: 'กะเพรา', price: 6000, isAvailable: true }],
      quote: { kitchenId: 'k1', inZone: true, distanceKm: 1, deliveryFee: 2000 },
      createdCapture: (d) => (captured = d),
    });
    const res: any = await service.create(customer, baseDto);
    // 2 x 6000 = 12000 + ค่าส่ง 2000 = 14000
    expect(captured.subtotal).toBe(12000);
    expect(captured.deliveryFee).toBe(2000);
    expect(captured.total).toBe(14000);
    expect(captured.kitchen.connect.id).toBe('k1');
    expect(res.id).toBe('order-1');
  });

  it('เมนูไม่อยู่ในแบรนด์/ปิดขาย → BadRequest', async () => {
    const { service } = makeService({ menuItems: [] });
    await expect(service.create(customer, baseDto)).rejects.toThrow();
  });

  it('idempotencyKey ชนกับออเดอร์ของคนอื่น (P2002 แต่ไม่ใช่ของเรา) → Conflict ไม่รั่วข้อมูล', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service } = makeService({
      menuItems: [{ id: 'm1', name: 'กะเพรา', price: 6000, isAvailable: true }],
      // findFirst คืน null ทั้งครั้งแรกและตอน recovery (คีย์ไม่ใช่ของลูกค้ารายนี้)
      createImpl: jest.fn().mockRejectedValue(p2002),
    });
    await expect(service.create(customer, baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
