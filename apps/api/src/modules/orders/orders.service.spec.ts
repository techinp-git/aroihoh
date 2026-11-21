import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';

// mock deps แบบเบา ๆ เพื่อทดสอบ decision logic (idempotency / zone gating / server pricing)
function makeService(overrides: {
  existingOrder?: unknown;
  quote?: any;
  menuItems?: any[];
  createdCapture?: (data: any) => void;
  createImpl?: any;
  savedAddress?: any; // US-58: หมุดในสมุดที่ findFirst จะคืน (null = ไม่ใช่ของลูกค้ารายนี้)
  savedAddressCount?: number;
  preorder?: any; // US-22: ผลการตัดสินรอบส่งล่วงหน้าที่ PreorderService จะคืน
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
    brand: {
      findUnique: jest.fn().mockResolvedValue({ codEnabled: true }),
    },
    // create ห่อใน $transaction (US-57) — mock ให้เรียก callback ด้วย tx = prisma ตัวเดียวกัน
    $transaction: jest.fn().mockImplementation((cb: any) => cb(prisma)),
    // US-58: สมุดที่อยู่
    address: {
      findFirst: jest.fn().mockResolvedValue(overrides.savedAddress ?? null),
      count: jest.fn().mockResolvedValue(overrides.savedAddressCount ?? 0),
      create: jest.fn().mockResolvedValue({ id: 'addr-new' }),
    },
  };
  const delivery: any = {
    quote: jest.fn().mockResolvedValue(
      overrides.quote ?? { kitchenId: 'k1', inZone: true, distanceKm: 1, deliveryFee: 2000 },
    ),
  };
  const events: any = { emit: jest.fn() };
  // US-08/09: คิวแจ้งเตือน — mock ให้เงียบ, ตัวจริงถูกเรียกแบบ fire-and-forget
  const notify: any = {
    notifyOrderConfirmed: jest.fn().mockResolvedValue({ queued: true }),
    notifyStatusChanged: jest.fn().mockResolvedValue({ queued: true }),
    notifyPointsEarned: jest.fn().mockResolvedValue({ queued: true }),
  };
  // US-56/57: สะสมแต้ม — ไม่ได้เปิดใช้ในเทสต์ชุดนี้ (คืน 0 แต้ม / ไม่มีส่วนลด)
  const loyalty: any = {
    awardForOrder: jest.fn().mockResolvedValue(0),
    planRewardDiscount: jest.fn(),
    consumeRewardForOrder: jest.fn(),
  };
  // US-22: สั่งล่วงหน้า — ค่าเริ่มต้นคือ "ไม่ส่ง deliverySlotId" จึงไม่ถูกเรียก
  const preorder: any = {
    resolveForOrder: jest.fn().mockResolvedValue(
      overrides.preorder ?? {
        ok: true,
        scheduledAt: new Date('2026-11-22T04:00:00.000Z'),
        slot: { id: 'noon', name: 'รอบเที่ยง' },
      },
    ),
  };
  return {
    service: new OrdersService(prisma, delivery, events, notify, loyalty, preorder),
    prisma,
    delivery,
    notify,
    loyalty,
    preorder,
  };
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

// US-58: ปลายทางของออเดอร์มาได้ 2 ทาง — สมุดที่อยู่ หรือหมุดที่ปักสด
describe('OrdersService.create — ที่อยู่ปลายทาง (US-58)', () => {
  const savedDto = {
    idempotencyKey: 'key-saved',
    items: [{ menuItemId: 'm1', qty: 1 }],
    savedAddressId: 'addr-home',
    paymentMethod: 'cod' as const,
  };
  const menu = [{ id: 'm1', name: 'กะเพรา', price: 6000, isAvailable: true }];

  it('หมุดในสมุด: ใช้พิกัดจาก DB ไปเช็คเขต ไม่เชื่อพิกัดจาก client', async () => {
    let captured: any;
    const { service, delivery, prisma } = makeService({
      menuItems: menu,
      savedAddress: {
        label: 'บ้าน',
        detail: 'ซอย 23',
        note: 'ชั้น 12',
        lat: 13.75,
        lng: 100.56,
      },
      createdCapture: (d) => (captured = d),
    });
    await service.create(customer, savedDto);

    expect(delivery.quote).toHaveBeenCalledWith('brand-1', { lat: 13.75, lng: 100.56 }, { scheduled: false });
    // where ต้องผูกทั้ง customerId และ brandId (กันหยิบหมุดข้ามคน/ข้ามแบรนด์)
    const where = prisma.address.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: 'addr-home',
      customerId: 'cust-1',
      brandId: 'brand-1',
      isSaved: true,
      deletedAt: null,
    });
    // ออเดอร์เก็บ snapshot ของตัวเอง ไม่ได้ผูกไปที่หมุดในสมุด
    expect(captured.address.create).toMatchObject({
      detail: 'ซอย 23',
      note: 'ชั้น 12',
      lat: 13.75,
    });
  });

  it('หมุดของคนอื่น/ถูกลบแล้ว → 404 ไม่สร้างออเดอร์', async () => {
    const { service, prisma } = makeService({ menuItems: menu, savedAddress: null });
    await expect(service.create(customer, savedDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('ไม่ส่งทั้ง savedAddressId และ deliveryAddress → 400', async () => {
    const { service } = makeService({ menuItems: menu });
    await expect(
      service.create(customer, { ...savedDto, savedAddressId: undefined } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('หมุดในสมุดก็ต้องเช็คเขตซ้ำ — ครัวย้ายแล้วนอกเขต → 422', async () => {
    const { service, prisma } = makeService({
      menuItems: menu,
      savedAddress: { label: null, detail: 'ไกล', note: null, lat: 13.9, lng: 100.9 },
      quote: { kitchenId: 'k1', inZone: false, distanceKm: 30, reason: 'เกินระยะจัดส่ง' },
    });
    await expect(service.create(customer, savedDto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('saveAddress: ปักสด + ติ๊กบันทึก → เพิ่มเข้าสมุด และหมุดแรกเป็นหมุดหลัก', async () => {
    const { service, prisma } = makeService({ menuItems: menu, savedAddressCount: 0 });
    await service.create(customer, {
      ...baseDto,
      idempotencyKey: 'key-save',
      saveAddress: true,
    } as any);
    expect(prisma.address.create).toHaveBeenCalled();
    const data = prisma.address.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ isSaved: true, isDefault: true, brandId: 'brand-1' });
  });

  it('saveAddress: สมุดเต็ม 5 หมุด → ข้ามการบันทึก แต่ออเดอร์ยังสำเร็จ', async () => {
    const { service, prisma } = makeService({ menuItems: menu, savedAddressCount: 5 });
    const res: any = await service.create(customer, {
      ...baseDto,
      idempotencyKey: 'key-full',
      saveAddress: true,
    } as any);
    expect(res.id).toBe('order-1');
    expect(prisma.address.create).not.toHaveBeenCalled();
  });

  it('สั่งด้วยหมุดในสมุด + saveAddress → ไม่บันทึกซ้ำเข้าสมุดอีก', async () => {
    const { service, prisma } = makeService({
      menuItems: menu,
      savedAddress: { label: 'บ้าน', detail: 'ซอย 23', note: null, lat: 13.75, lng: 100.56 },
    });
    await service.create(customer, { ...savedDto, saveAddress: true } as any);
    expect(prisma.address.create).not.toHaveBeenCalled();
  });

  // ── US-22: สั่งล่วงหน้า D-1 ──
  it('ไม่ส่ง deliverySlotId → ไม่แตะ preorder และ scheduledAt เป็น null (สั่งรับวันนี้)', async () => {
    let captured: any;
    const { service, preorder, delivery } = makeService({
      menuItems: menu,
      createdCapture: (d) => (captured = d),
    });
    await service.create(customer, { ...baseDto, idempotencyKey: 'key-now' } as any);
    expect(preorder.resolveForOrder).not.toHaveBeenCalled();
    expect(captured.scheduledAt).toBeNull();
    // เช็คเขตแบบปกติ = ต้องอยู่ในเวลาทำการ
    expect(delivery.quote).toHaveBeenCalledWith('brand-1', expect.anything(), { scheduled: false });
  });

  it('เลือกรอบส่ง → เก็บ scheduledAt = เวลาเริ่มรอบ และเช็คเขตแบบข้ามเวลาทำการ', async () => {
    let captured: any;
    const { service, preorder, delivery } = makeService({
      menuItems: menu,
      createdCapture: (d) => (captured = d),
    });
    await service.create(customer, {
      ...baseDto,
      idempotencyKey: 'key-pre',
      deliverySlotId: 'noon',
    } as any);
    expect(preorder.resolveForOrder).toHaveBeenCalledWith('brand-1', 'noon');
    expect(captured.scheduledAt?.toISOString()).toBe('2026-11-22T04:00:00.000Z');
    expect(delivery.quote).toHaveBeenCalledWith('brand-1', expect.anything(), { scheduled: true });
  });

  it('เลยเวลาปิดรับ → 422 พร้อม code ให้ LIFF แยกเคส และไม่สร้างออเดอร์', async () => {
    const { service, prisma } = makeService({
      menuItems: menu,
      preorder: {
        ok: false,
        code: 'PREORDER_CUTOFF_PASSED',
        reason: 'ปิดรับออเดอร์ของรอบเที่ยงพรุ่งนี้แล้ว (ปิดรับ 20:00)',
        cutoffAt: '2026-11-21T13:00:00.000Z',
      },
    });
    await expect(
      service.create(customer, { ...baseDto, idempotencyKey: 'key-late', deliverySlotId: 'noon' } as any),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('รอบส่งของครัวอื่น/ปิดใช้งาน → 404 (ไม่บอกว่ามีอยู่จริง)', async () => {
    const { service, prisma } = makeService({
      menuItems: menu,
      preorder: { ok: false, code: 'SLOT_NOT_FOUND', reason: 'ไม่พบรอบส่งนี้' },
    });
    await expect(
      service.create(customer, { ...baseDto, idempotencyKey: 'key-slot', deliverySlotId: 'x' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('ออเดอร์ล่วงหน้านอกเขต → ยัง 422 OUT_OF_ZONE (เช็คเขตไม่ถูกข้าม)', async () => {
    const { service, prisma } = makeService({
      menuItems: menu,
      quote: { kitchenId: 'k1', inZone: false, distanceKm: 12, reason: 'เกินระยะจัดส่ง' },
    });
    await expect(
      service.create(customer, { ...baseDto, idempotencyKey: 'key-pre-out', deliverySlotId: 'noon' } as any),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});