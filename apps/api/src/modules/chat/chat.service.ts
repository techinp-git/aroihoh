import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // รายการสนทนา: ลูกค้าที่เคยมีข้อความ + ข้อความล่าสุด + จำนวนที่ยังไม่อ่าน
  async conversations(brandId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { brandId, chatMessages: { some: {} } },
      include: { chatMessages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const unread = await this.prisma.chatMessage.groupBy({
      by: ['customerId'],
      where: { brandId, direction: 'inbound', isRead: false },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.customerId, u._count._all]));

    return customers
      .map((c) => ({
        customerId: c.id,
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
      select: { id: true, displayName: true, lineUserId: true },
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
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('ไม่พบลูกค้า');

    const msg = await this.prisma.chatMessage.create({
      data: { brandId, customerId, direction: 'outbound', adminId, text, isRead: true },
    });
    // TODO(SETUP-1/line): enqueue LINE push ให้ลูกค้าเมื่อ line module พร้อม (กันซ้ำด้วย message_logs)
    return msg;
  }

  // จำลองข้อความขาเข้า (ปกติมาจาก LINE webhook US-10) — ใช้ทดสอบ/seed ระหว่างยังไม่มี LINE
  async recordInbound(brandId: string, customerId: string, text: string) {
    return this.prisma.chatMessage.create({
      data: { brandId, customerId, direction: 'inbound', text, isRead: false },
    });
  }
}
