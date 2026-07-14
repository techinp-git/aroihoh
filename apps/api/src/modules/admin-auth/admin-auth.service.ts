import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminRole } from '../../common/guards/admin-jwt.guard';

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
