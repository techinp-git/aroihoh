import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * US-07: แอดมิน mark ว่าเก็บเงินปลายทาง (COD) แล้ว
   *  - idempotent: ถ้า paid อยู่แล้ว คืนเลย
   *  - บันทึก Payment + audit log ในทรานแซกชันเดียว
   */
  async markCodPaid(brandId: string, orderId: string, adminId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, brandId },
    });
    if (!order) throw new NotFoundException('ไม่พบออเดอร์');
    if (order.paymentMethod !== 'cod') {
      throw new BadRequestException('ออเดอร์นี้ไม่ใช่ COD');
    }
    if (order.paymentStatus === 'paid') {
      return { orderId, paymentStatus: 'paid', alreadyPaid: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'paid' },
      });
      await tx.payment.create({
        data: {
          orderId,
          brandId,
          method: 'cod',
          status: 'paid',
          amount: order.total,
          paidAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          brandId,
          actorType: 'admin',
          actorId: adminId,
          action: 'order.mark_paid',
          entityType: 'order',
          entityId: orderId,
          before: { paymentStatus: order.paymentStatus },
          after: { paymentStatus: 'paid', method: 'cod' },
        },
      });
      return { orderId, paymentStatus: updated.paymentStatus, alreadyPaid: false };
    });
  }
}
