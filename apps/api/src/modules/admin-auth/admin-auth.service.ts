import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminRole } from '../../common/guards/admin-jwt.guard';
import { verifyLineIdToken } from '../auth/line-verify';
import { resolveLoginChannelId } from '../auth/login-channel';
import { canScanRedemptions } from './staff-mode';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // US-29: ตรวจ email/password → ออก admin JWT (พร้อม role + brandIds ที่เข้าถึงได้)
  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email },
      include: { adminBrands: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('บัญชีไม่ถูกต้องหรือถูกปิดใช้งาน');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    return this.buildAuth(user);
  }

  // US-36/ADR-06: ออก token ใหม่ให้ผู้ใช้เดิม (recompute brandIds)
  // ใช้หลังสร้าง/ลบแบรนด์ — brandIds ใน token เป็น cache ต้อง refresh เมื่อชุดแบรนด์เปลี่ยน
  async issueTokenFor(adminId: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { adminBrands: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('บัญชีไม่ถูกต้องหรือถูกปิดใช้งาน');
    }
    return this.buildAuth(user);
  }

  /**
   * US-61: เข้า "โหมดพนักงาน" ใน LIFF ด้วยบัญชี LINE ที่ผูกไว้แล้ว
   *
   * LIFF ยิงตัวนี้เงียบ ๆ ตอนเปิดแอปทุกครั้ง — ลูกค้าทั่วไปจะได้ 404 แล้วไม่เห็นอะไรเลย
   * ส่วนพนักงานที่เคยผูกไว้จะได้ admin token กลับไปโดยไม่ต้องพิมพ์รหัสผ่านซ้ำ
   */
  async loginWithLine(idToken: string, brandId: string) {
    const lineUserId = await this.verifyBrandIdToken(idToken, brandId);
    const key = { lineUserId_brandId: { lineUserId, brandId } };
    const link = await this.prisma.adminLineLink.findUnique({ where: key });
    // ยังไม่เคยผูก = คนทั่วไปที่บังเอิญเปิดลิงก์นี้ ตอบเหมือนไม่มีอะไรอยู่ตรงนี้
    if (!link) {
      throw new NotFoundException({
        code: 'NOT_LINKED',
        message: 'บัญชี LINE นี้ยังไม่ได้ผูกกับพนักงานคนไหน',
      });
    }

    // ปิดบัญชีพนักงานแล้ว = throw ที่นี่ (ผูก LINE ค้างไว้ก็เข้าไม่ได้)
    const auth = await this.issueTokenFor(link.adminUserId);
    // ย้ายออกจากแบรนด์นี้แล้ว = หมดสิทธิ์โหมดพนักงานของร้านนี้ทันที ไม่ต้องรอเลิกผูก
    if (!auth.admin.brandIds.includes(brandId)) {
      throw new ForbiddenException('บัญชีนี้ไม่มีสิทธิ์ในร้านนี้แล้ว');
    }

    await this.prisma.adminLineLink.update({ where: key, data: { lastUsedAt: new Date() } });
    return this.withStaffScope(auth, brandId);
  }

  /**
   * ผูกบัญชี LINE ที่กำลังใช้ เข้ากับแอดมินที่เพิ่งล็อกอินด้วยอีเมล/รหัสผ่าน
   * ต้องมีทั้ง admin JWT (รู้รหัสผ่าน) และ ID token ที่ผ่าน verify (ถือ LINE เครื่องนั้นจริง)
   *
   * ไม่มี idToken (dev / เปิดหน้าเว็บนอก LINE) = ไม่ผูก แต่ยังคืนสิทธิ์โหมดพนักงานให้ใช้รอบนี้
   */
  async linkLine(adminId: string, idToken: string | undefined, brandId: string) {
    const auth = await this.issueTokenFor(adminId);
    if (!auth.admin.brandIds.includes(brandId)) {
      throw new ForbiddenException('บัญชีนี้ไม่มีสิทธิ์ในร้านนี้');
    }
    let linked = false;
    if (idToken) {
      const lineUserId = await this.verifyBrandIdToken(idToken, brandId);
      // ผูกซ้ำจากคนละบัญชี = ย้ายไปบัญชีใหม่ (พิสูจน์รหัสผ่านมาแล้ว) ไม่ใช่ error
      await this.prisma.adminLineLink.upsert({
        where: { lineUserId_brandId: { lineUserId, brandId } },
        create: { lineUserId, brandId, adminUserId: adminId, lastUsedAt: new Date() },
        update: { adminUserId: adminId, linkedAt: new Date(), lastUsedAt: new Date() },
      });
      linked = true;
    }
    return { ...this.withStaffScope(auth, brandId), linked };
  }

  /** เลิกผูก — ไม่ส่ง brandId = เลิกทุกแบรนด์ (เช่นทำมือถือหาย) */
  async unlinkLine(adminId: string, brandId?: string) {
    const r = await this.prisma.adminLineLink.deleteMany({
      where: { adminUserId: adminId, ...(brandId ? { brandId } : {}) },
    });
    return { unlinked: r.count };
  }

  /** verify ID token กับ Login channel ของแบรนด์นั้น → คืน LINE userId ที่เชื่อถือได้ */
  private async verifyBrandIdToken(idToken: string, brandId: string): Promise<string> {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.isActive) throw new NotFoundException('brand not found or inactive');
    // Login channel ≠ Messaging channel (คนละเลข) — ใช้ตัวเดียวกับฝั่งลูกค้า
    const loginChannelId = resolveLoginChannelId(brand);
    if (!loginChannelId) {
      throw new UnauthorizedException('brand has no LINE channel configured');
    }
    try {
      const payload = await verifyLineIdToken(idToken, loginChannelId);
      return payload.sub;
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof Error ? e.message : 'invalid LINE id token',
      );
    }
  }

  /** ต่อท้ายผลล็อกอินด้วยคำตอบว่า "แบรนด์นี้เปิดหน้าสแกนให้ไหม" — LIFF ไม่ต้องคิดกฎเอง */
  private withStaffScope(
    auth: { token: string; admin: { role: string; brandIds: string[] } },
    brandId: string,
  ) {
    return {
      ...auth,
      brandId,
      canScanRedemptions: canScanRedemptions(
        auth.admin.role as AdminRole,
        auth.admin.brandIds,
        brandId,
      ),
    };
  }

  private async buildAuth(
    user: { id: string; name: string; email: string; merchantId: string; role: string; adminBrands: { brandId: string }[] },
  ) {
    const brandIds = await this.resolveBrandIds(
      user.merchantId,
      user.role as AdminRole,
      user.adminBrands.map((ab) => ab.brandId),
    );

    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');

    const token = jwt.sign(
      { sub: user.id, merchantId: user.merchantId, role: user.role, brandIds, typ: 'admin' },
      secret,
      { expiresIn: '12h' },
    );

    return {
      token,
      admin: { id: user.id, name: user.name, email: user.email, role: user.role, brandIds },
    };
  }

  // owner/manager เห็นทุกแบรนด์ของ merchant · staff เห็นเฉพาะที่ผูกใน admin_brands
  async resolveBrandIds(
    merchantId: string,
    role: AdminRole,
    assignedBrandIds: string[],
  ): Promise<string[]> {
    if (role === 'owner' || role === 'manager') {
      const brands = await this.prisma.brand.findMany({
        where: { merchantId },
        select: { id: true },
      });
      return brands.map((b) => b.id);
    }
    return assignedBrandIds;
  }

  async me(adminId: string) {
    const u = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!u) throw new UnauthorizedException();
    return { id: u.id, name: u.name, email: u.email, role: u.role };
  }
}
