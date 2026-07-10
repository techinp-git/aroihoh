import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isAccepting, nowHHMMBangkok } from './store-hours';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ครัวของแบรนด์ (MVP ใช้ครัวแรกที่ผูก) — ทุก op กรอง brandId แล้วผ่าน brandKitchen
  private async kitchenOf(brandId: string) {
    const link = await this.prisma.brandKitchen.findFirst({
      where: { brandId },
      include: { kitchen: true },
    });
    if (!link) throw new NotFoundException('ยังไม่ได้ตั้งค่าครัว');
    return link.kitchen;
  }

  async getStore(brandId: string) {
    const k = await this.kitchenOf(brandId);
    const acc = isAccepting(
      { isOpen: k.isOpen, openTime: k.openTime, closeTime: k.closeTime },
      nowHHMMBangkok(),
    );
    return {
      kitchenId: k.id,
      name: k.name,
      isOpen: k.isOpen,
      openTime: k.openTime,
      closeTime: k.closeTime,
      acceptingNow: acc.ok,
      reason: acc.reason ?? null,
    };
  }

  // US-16: ปุ่มพักรับออเดอร์ฉุกเฉิน
  async setPause(brandId: string, isOpen: boolean) {
    const k = await this.kitchenOf(brandId);
    await this.prisma.kitchen.update({ where: { id: k.id }, data: { isOpen } });
    return this.getStore(brandId);
  }

  // US-16: ตั้งเวลาทำการ (ส่ง null ทั้งคู่ = เปิดตลอด)
  async setHours(brandId: string, openTime: string | null, closeTime: string | null) {
    if (openTime && !HHMM.test(openTime)) throw new BadRequestException('เวลาเปิดไม่ถูกต้อง (HH:MM)');
    if (closeTime && !HHMM.test(closeTime)) throw new BadRequestException('เวลาปิดไม่ถูกต้อง (HH:MM)');
    if (!!openTime !== !!closeTime) throw new BadRequestException('ต้องระบุเวลาเปิด-ปิดคู่กัน');
    if (openTime && closeTime && openTime >= closeTime) {
      throw new BadRequestException('เวลาเปิดต้องก่อนเวลาปิด');
    }
    const k = await this.kitchenOf(brandId);
    await this.prisma.kitchen.update({
      where: { id: k.id },
      data: { openTime: openTime || null, closeTime: closeTime || null },
    });
    return this.getStore(brandId);
  }
}
