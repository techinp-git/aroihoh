import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminJwt } from '../../common/guards/admin-jwt.guard';
import { assertBrandAccess } from '../../common/admin-scope';
import {
  CODE_LENGTH,
  TOKEN_LENGTH,
  canRedeem,
  formatCodeForHuman,
  generateCode,
  generateToken,
  isExpired,
  ledgerRef,
  nextReward,
  normalizeCode,
  redemptionExpiry,
} from './ledger';

export interface CustomerScope {
  customerId: string;
  brandId: string;
}

/** สร้าง batch ทีเดียวได้ไม่เกินนี้ — กัน transaction ยาวจนล็อกตารางนาน */
const MAX_BATCH_QUANTITY = 2000;

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────── ลูกค้า ─────────

  /**
   * US-50: สแกน QR แล้วได้แต้ม
   *
   * หัวใจอยู่ที่ "จองสิทธิ์ที่ DB" — ตัดสินว่าใครได้แต้มด้วย conditional update
   * (WHERE status='active') ไม่ใช่ SELECT แล้วค่อย UPDATE ไม่งั้นสแกนพร้อมกัน 2 คนได้ทั้งคู่
   */
  async earn(scope: CustomerScope, rawCode: string) {
    const code = normalizeCode(rawCode ?? '');
    if (!code) throw new BadRequestException('ไม่พบรหัส QR');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.loyaltyQrCode.findUnique({
        where: { code },
        include: { batch: { select: { status: true, expiresAt: true } } },
      });

      // ไม่มีจริง / คนละแบรนด์ / ล็อตยังไม่เปิด / ล็อตถูกยกเลิก / หมดอายุ
      // → ตอบเหมือนกันหมด ไม่บอกว่ารหัสนี้มีอยู่จริงในระบบ
      const unusable =
        !row ||
        row.brandId !== scope.brandId ||
        row.status === 'revoked' ||
        row.batch.status !== 'active' ||
        (row.batch.expiresAt !== null && isExpired(row.batch.expiresAt, new Date()));
      if (unusable) throw new NotFoundException('รหัสนี้ใช้ไม่ได้');

      if (row.status === 'used') {
        throw new ConflictException({
          code: 'CODE_USED',
          message: 'QR นี้ถูกใช้ไปแล้ว',
          usedByMe: row.usedByCustomerId === scope.customerId,
        });
      }

      const claimed = await tx.loyaltyQrCode.updateMany({
        where: { id: row.id, status: 'active' }, // ← จุดตัดสินสิทธิ์ ห้ามเอาเงื่อนไขนี้ออก
        data: {
          status: 'used',
          usedByCustomerId: scope.customerId,
          usedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ code: 'CODE_USED', message: 'QR นี้ถูกใช้ไปแล้ว' });
      }

      await tx.loyaltyTransaction.create({
        data: {
          brandId: scope.brandId,
          customerId: scope.customerId,
          type: 'earn',
          points: row.points,
          ...ledgerRef('qr_code', row.id),
        },
      });
      const customer = await tx.customer.update({
        where: { id: scope.customerId },
        data: { pointsBalance: { increment: row.points } },
        select: { pointsBalance: true },
      });

      return { earned: row.points, balance: customer.pointsBalance };
    });
  }

  /** แต้มคงเหลือ + ประวัติ + คูปองที่ยังค้างอยู่ */
  async me(scope: CustomerScope) {
    const [customer, history, pending, rewards] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: scope.customerId, brandId: scope.brandId },
        select: { pointsBalance: true },
      }),
      this.prisma.loyaltyTransaction.findMany({
        where: { customerId: scope.customerId, brandId: scope.brandId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, points: true, note: true, createdAt: true },
      }),
      this.prisma.loyaltyRedemption.findFirst({
        where: { customerId: scope.customerId, brandId: scope.brandId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
      this.activeRewards(scope.brandId),
    ]);
    if (!customer) throw new NotFoundException('ไม่พบลูกค้า');

    const now = new Date();
    return {
      balance: customer.pointsBalance,
      nextReward: nextReward(customer.pointsBalance, rewards),
      history,
      // คูปองที่หมดอายุแล้วไม่ต้องคืนให้ LIFF โชว์ (สถานะจริงเปลี่ยนตอนคนขายสแกน)
      pending: pending && !isExpired(pending.expiresAt, now) ? this.publicRedemption(pending) : null,
    };
  }

  private activeRewards(brandId: string) {
    return this.prisma.loyaltyReward.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { pointsCost: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        pointsCost: true,
        type: true,
        menuItemId: true,
        discountAmount: true,
      },
    });
  }

  async listRewards(scope: CustomerScope) {
    const [rewards, customer] = await Promise.all([
      this.activeRewards(scope.brandId),
      this.prisma.customer.findFirst({
        where: { id: scope.customerId, brandId: scope.brandId },
        select: { pointsBalance: true },
      }),
    ]);
    const balance = customer?.pointsBalance ?? 0;
    return {
      balance,
      rewards: rewards.map((r) => ({ ...r, affordable: canRedeem(balance, r.pointsCost) })),
    };
  }

  /** สรุปสั้น ๆ ให้ /me/profile (US-59 การ์ดแต้ม + แท็บ "แต้ม") */
  async summaryForProfile(scope: CustomerScope, balance: number) {
    const rewards = await this.activeRewards(scope.brandId);
    const next = nextReward(balance, rewards);
    return {
      balance,
      nextReward: next ? { name: next.name, pointsCost: next.pointsCost } : null,
    };
  }

  private publicRedemption(r: {
    id: string;
    token: string;
    rewardName: string;
    pointsCost: number;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      token: r.token,
      // รหัสที่โชว์ให้คนอ่าน = token เดียวกับที่อยู่ใน QR (คนขายพิมพ์เองได้เมื่อกล้องไม่ติด)
      code: formatCodeForHuman(r.token),
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: r.status,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    };
  }

  /**
   * ขอคูปองแลกรางวัล — **ยังไม่ตัดแต้ม** (ตัดตอนคนขังยืนยันที่เดียว)
   * มี pending ได้ทีละ 1 ใบ ใบเก่าถูกยกเลิกอัตโนมัติ → กันถือคูปองหลายใบไปไล่แลก
   */
  async createRedemption(scope: CustomerScope, rewardId: string) {
    return this.prisma.$transaction(async (tx) => {
      const reward = await tx.loyaltyReward.findFirst({
        where: { id: rewardId, brandId: scope.brandId, isActive: true },
      });
      if (!reward) throw new NotFoundException('ไม่พบรางวัลนี้');

      const customer = await tx.customer.findFirst({
        where: { id: scope.customerId, brandId: scope.brandId },
        select: { pointsBalance: true },
      });
      if (!customer) throw new NotFoundException('ไม่พบลูกค้า');
      if (!canRedeem(customer.pointsBalance, reward.pointsCost)) {
        throw new UnprocessableEntityException({
          code: 'NOT_ENOUGH_POINTS',
          message: `แต้มไม่พอ ต้องมี ${reward.pointsCost} แต้ม`,
          balance: customer.pointsBalance,
          pointsCost: reward.pointsCost,
        });
      }

      await tx.loyaltyRedemption.updateMany({
        where: { customerId: scope.customerId, brandId: scope.brandId, status: 'pending' },
        data: { status: 'cancelled' },
      });

      const now = new Date();
      const created = await tx.loyaltyRedemption.create({
        data: {
          brandId: scope.brandId,
          customerId: scope.customerId,
          rewardId: reward.id,
          rewardName: reward.name, // snapshot — เปลี่ยนชื่อรางวัลทีหลังไม่ทำให้คูปองเก่าเพี้ยน
          pointsCost: reward.pointsCost,
          token: generateToken(randomBytes(TOKEN_LENGTH)),
          expiresAt: redemptionExpiry(now),
        },
      });
      return this.publicRedemption(created);
    });
  }

  /** LIFF poll สถานะคูปอง (เจ้าของเท่านั้น) */
  async getRedemption(scope: CustomerScope, id: string) {
    const r = await this.prisma.loyaltyRedemption.findFirst({
      where: { id, customerId: scope.customerId, brandId: scope.brandId },
    });
    if (!r) throw new NotFoundException('ไม่พบคูปองนี้');
    // ยังไม่มีใครสแกนแล้วเลยเวลา → รายงานว่าหมดอายุโดยไม่ต้องรอ job มาไล่ปิด
    const status =
      r.status === 'pending' && isExpired(r.expiresAt, new Date()) ? 'expired' : r.status;
    return { ...this.publicRedemption(r), status };
  }

  async cancelRedemption(scope: CustomerScope, id: string) {
    const done = await this.prisma.loyaltyRedemption.updateMany({
      where: { id, customerId: scope.customerId, brandId: scope.brandId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (done.count === 0) throw new NotFoundException('ไม่พบคูปองที่ยกเลิกได้');
    return { cancelled: true };
  }

  // ───────── แอดมิน ─────────

  /** สร้างล็อต QR + ออกโค้ดทั้งหมดในทรานแซกชันเดียว (เริ่มที่ draft เสมอ) */
  async createBatch(
    admin: AdminJwt,
    dto: { brandId: string; name: string; points: number; quantity: number; menuItemId?: string; expiresAt?: string },
  ) {
    assertBrandAccess(admin, dto.brandId);
    if (dto.quantity > MAX_BATCH_QUANTITY) {
      throw new BadRequestException(`สร้างได้ครั้งละไม่เกิน ${MAX_BATCH_QUANTITY} ใบ`);
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.loyaltyQrBatch.create({
        data: {
          brandId: dto.brandId,
          name: dto.name,
          points: dto.points,
          quantity: dto.quantity,
          menuItemId: dto.menuItemId ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdById: admin.sub,
        },
      });
      const codes = new Set<string>();
      while (codes.size < dto.quantity) codes.add(generateCode(randomBytes(CODE_LENGTH)));
      await tx.loyaltyQrCode.createMany({
        data: [...codes].map((code) => ({
          brandId: dto.brandId,
          batchId: batch.id,
          code,
          points: dto.points,
        })),
      });
      return { ...batch, codesCreated: codes.size };
    });
  }

  async setBatchStatus(admin: AdminJwt, brandId: string, id: string, status: 'active' | 'revoked' | 'draft') {
    assertBrandAccess(admin, brandId);
    const done = await this.prisma.loyaltyQrBatch.updateMany({
      where: { id, brandId },
      data: { status },
    });
    if (done.count === 0) throw new NotFoundException('ไม่พบล็อตนี้');
    return { id, status };
  }

  async listBatches(admin: AdminJwt, brandId: string) {
    assertBrandAccess(admin, brandId);
    const batches = await this.prisma.loyaltyQrBatch.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { codes: true } } },
    });
    const used = await this.prisma.loyaltyQrCode.groupBy({
      by: ['batchId'],
      where: { brandId, status: 'used' },
      _count: { _all: true },
    });
    const usedBy = new Map(used.map((u) => [u.batchId, u._count._all]));
    return batches.map((b) => ({
      ...b,
      codeCount: b._count.codes,
      usedCount: usedBy.get(b.id) ?? 0,
    }));
  }

  /** โค้ดทั้งล็อต — เอาไป render QR / ทำ CSV ส่งโรงพิมพ์ (US-51) */
  async listCodes(admin: AdminJwt, brandId: string, batchId: string) {
    assertBrandAccess(admin, brandId);
    const batch = await this.prisma.loyaltyQrBatch.findFirst({ where: { id: batchId, brandId } });
    if (!batch) throw new NotFoundException('ไม่พบล็อตนี้');
    const codes = await this.prisma.loyaltyQrCode.findMany({
      where: { batchId, brandId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, code: true, points: true, status: true, usedAt: true },
    });
    return {
      batch: { id: batch.id, name: batch.name, points: batch.points, status: batch.status },
      codes: codes.map((c) => ({ ...c, human: formatCodeForHuman(c.code) })),
    };
  }

  async createReward(
    admin: AdminJwt,
    dto: {
      brandId: string; name: string; pointsCost: number; description?: string;
      type?: 'free_item' | 'discount'; menuItemId?: string; discountAmount?: number; sortOrder?: number;
    },
  ) {
    assertBrandAccess(admin, dto.brandId);
    return this.prisma.loyaltyReward.create({
      data: {
        brandId: dto.brandId,
        name: dto.name,
        description: dto.description ?? null,
        pointsCost: dto.pointsCost,
        type: dto.type ?? 'free_item',
        menuItemId: dto.menuItemId ?? null,
        discountAmount: dto.discountAmount ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateReward(
    admin: AdminJwt,
    brandId: string,
    id: string,
    dto: Partial<{ name: string; description: string; pointsCost: number; isActive: boolean; sortOrder: number; discountAmount: number; menuItemId: string }>,
  ) {
    assertBrandAccess(admin, brandId);
    const done = await this.prisma.loyaltyReward.updateMany({
      where: { id, brandId },
      data: dto,
    });
    if (done.count === 0) throw new NotFoundException('ไม่พบรางวัลนี้');
    return this.prisma.loyaltyReward.findUnique({ where: { id } });
  }

  async listAdminRewards(admin: AdminJwt, brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.prisma.loyaltyReward.findMany({
      where: { brandId },
      orderBy: [{ sortOrder: 'asc' }, { pointsCost: 'asc' }],
    });
  }

  /** คนขายสแกนแล้วเห็นก่อนกดยืนยัน — ยังไม่แตะแต้ม */
  async previewRedemption(admin: AdminJwt, rawToken: string) {
    // คนขายอาจพิมพ์เอง "k7qx-2m9f-3btp" → ปรับให้ตรงกับที่เก็บใน DB ก่อนค้น
    const token = normalizeCode(rawToken ?? '');
    const r = await this.prisma.loyaltyRedemption.findUnique({
      where: { token },
      include: { customer: { select: { displayName: true, pointsBalance: true } } },
    });
    if (!r) throw new NotFoundException('ไม่พบคูปองนี้');
    // brandId มาจากตัวคูปอง ไม่ใช่จาก client — แล้วค่อยเช็คว่า admin คุมแบรนด์นั้นจริง
    assertBrandAccess(admin, r.brandId);

    const expired = r.status === 'pending' && isExpired(r.expiresAt, new Date());
    return {
      id: r.id,
      brandId: r.brandId,
      customerName: r.customer.displayName,
      balance: r.customer.pointsBalance,
      rewardName: r.rewardName,
      pointsCost: r.pointsCost,
      status: expired ? 'expired' : r.status,
      expiresAt: r.expiresAt,
      confirmable: r.status === 'pending' && !expired && r.customer.pointsBalance >= r.pointsCost,
    };
  }

  /**
   * ยืนยันแลก — จุดเดียวในระบบที่ตัดแต้ม
   *
   * ตัดด้วย conditional update (WHERE pointsBalance >= cost) → ยอดแต้มติดลบไม่ได้แม้ยิงพร้อมกัน
   * แล้วค่อยจอง redemption (WHERE status='pending') → กดยืนยันซ้ำ/สองเครื่องพร้อมกัน ตัดแต้มครั้งเดียว
   */
  async confirmRedemption(admin: AdminJwt, rawToken: string) {
    const token = normalizeCode(rawToken ?? '');
    const found = await this.prisma.loyaltyRedemption.findUnique({ where: { token } });
    if (!found) throw new NotFoundException('ไม่พบคูปองนี้');
    assertBrandAccess(admin, found.brandId);

    return this.prisma.$transaction(async (tx) => {
      const r = await tx.loyaltyRedemption.findUnique({ where: { token } });
      if (!r) throw new NotFoundException('ไม่พบคูปองนี้');
      if (r.status !== 'pending') {
        throw new ConflictException({ code: 'NOT_PENDING', message: `คูปองนี้สถานะ ${r.status} แล้ว` });
      }
      if (isExpired(r.expiresAt, new Date())) {
        await tx.loyaltyRedemption.updateMany({
          where: { id: r.id, status: 'pending' },
          data: { status: 'expired' },
        });
        throw new ConflictException({ code: 'EXPIRED', message: 'คูปองหมดอายุแล้ว ให้ลูกค้าขอใหม่' });
      }

      const deducted = await tx.customer.updateMany({
        where: {
          id: r.customerId,
          brandId: r.brandId,
          pointsBalance: { gte: r.pointsCost }, // ← invariant: แต้มติดลบไม่ได้
        },
        data: { pointsBalance: { decrement: r.pointsCost } },
      });
      if (deducted.count === 0) {
        throw new UnprocessableEntityException({
          code: 'NOT_ENOUGH_POINTS',
          message: 'แต้มลูกค้าไม่พอแล้ว (อาจเพิ่งใช้ไปกับคูปองอื่น)',
        });
      }

      const claimed = await tx.loyaltyRedemption.updateMany({
        where: { id: r.id, status: 'pending' }, // กดยืนยันซ้ำ = count 0 → rollback ทั้งก้อน
        data: {
          status: 'confirmed',
          confirmedByAdminId: admin.sub,
          confirmedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ code: 'NOT_PENDING', message: 'คูปองนี้เพิ่งถูกยืนยันไปแล้ว' });
      }

      await tx.loyaltyTransaction.create({
        data: {
          brandId: r.brandId,
          customerId: r.customerId,
          type: 'redeem',
          points: -r.pointsCost,
          note: r.rewardName,
          ...ledgerRef('redemption', r.id),
        },
      });
      await tx.auditLog.create({
        data: {
          brandId: r.brandId,
          actorType: 'admin',
          actorId: admin.sub,
          action: 'loyalty.redeem',
          entityType: 'loyalty_redemption',
          entityId: r.id,
          before: { status: 'pending' },
          after: { status: 'confirmed', pointsCost: r.pointsCost, reward: r.rewardName },
        },
      });

      const after = await tx.customer.findUnique({
        where: { id: r.customerId },
        select: { pointsBalance: true },
      });
      return {
        confirmed: true,
        rewardName: r.rewardName,
        pointsSpent: r.pointsCost,
        balance: after?.pointsBalance ?? 0,
      };
    });
  }
}
