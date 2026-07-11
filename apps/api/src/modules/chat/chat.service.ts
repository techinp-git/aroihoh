import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineService } from '../line/line.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly line: LineService,
  ) {}

  // รายการสนทนา: ลูกค้าที่เคยมีข้อความ + ข้อความล่าสุด + จำนวนที่ยังไม่อ่าน
  // US-40: รับหลายแบรนด์ (Chat Center เดียว) — แต่ละห้องติด brandId/brandName บอกว่าคุยผ่าน OA ไหน
  async conversations(brandIds: string[]) {
    if (brandIds.length === 0) return [];
    const customers = await this.prisma.customer.findMany({
      where: { brandId: { in: brandIds }, chatMessages: { some: {} } },
      include: {
        chatMessages: { orderBy: { createdAt: 'desc' }, take: 1 },
        brand: { select: { id: true, name: true } },
      },
    });
    const unread = await this.prisma.chatMessage.groupBy({
      by: ['customerId'],
      where: { brandId: { in: brandIds }, direction: 'inbound', isRead: false },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.customerId, u._count._all]));

    return customers
      .map((c) => ({
        customerId: c.id,
        brandId: c.brandId,
        brandName: c.brand.name,
        displayName: c.displayName,
        lastMessage: c.chatMessages[0]?.text ?? '',
        lastAt: c.chatMessages[0]?.createdAt ?? null,
        lastDirection: c.chatMessages[0]?.direction ?? null,
        unread: unreadMap.get(c.id) ?? 0,
      }))
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
  }

  // เปิดห้องแชต: คืนข้อความทั้งหมด + mark inbound เป็นอ่านแล้ว
  async thread(brandId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, brandId },
      select: {
        id: true,
        displayName: true,
        lineUserId: true,
        brandId: true,
        brand: { select: { name: true } }, // US-40: บอกว่าห้องนี้คุยผ่าน OA ไหน
      },
    });
    if (!customer) throw new NotFoundException('ไม่พบลูกค้า');

    await this.prisma.chatMessage.updateMany({
      where: { brandId, customerId, direction: 'inbound', isRead: false },
      data: { isRead: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: { brandId, customerId },
      orderBy: { createdAt: 'asc' },
    });
    return { customer, messages };
  }

  // ส่งข้อความ (แอดมิน → ลูกค้า) — เก็บลง DB; การยิงเข้า LINE จริงรอ line module (SETUP-1)
  async send(brandId: string, customerId: string, adminId: string, text: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, brandId },
      select: { id: true, lineUserId: true },
    });
    if (!customer) throw new NotFoundException('ไม่พบลูกค้า');

    // แอดมินตอบทีหลัง = ไม่มี reply token → sendToCustomer จะ push ให้ (gated ถ้ายังไม่ผูก) + log channel
    const res = await this.line
      .sendToCustomer(brandId, customer.lineUserId, text, { type: 'chat', customerId })
      .catch(() => ({ via: 'push' as const, ok: false, skipped: false }));

    const msg = await this.prisma.chatMessage.create({
      data: { brandId, customerId, direction: 'outbound', adminId, text, isRead: true },
    });
    return { ...msg, delivered: res.ok, via: res.via, skipped: res.skipped };
  }

  // จำลองข้อความขาเข้า (ปกติมาจาก LINE webhook US-10) — ใช้ทดสอบ/seed ระหว่างยังไม่มี LINE
  async recordInbound(brandId: string, customerId: string, text: string) {
    return this.prisma.chatMessage.create({
      data: { brandId, customerId, direction: 'inbound', text, isRead: false },
    });
  }
}
