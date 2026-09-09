import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';

// US-45: role ที่ผูกแบรนด์ (owner/manager เห็นทุกแบรนด์อยู่แล้ว) — ต้องระบุ brandIds
const BRAND_SCOPED = new Set(['staff', 'kitchen', 'chat_agent']);

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ทุก query กรอง merchantId — เห็นเฉพาะ user ใน merchant ตัวเอง
  async list(merchantId: string) {
    const users = await this.prisma.adminUser.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: {
        adminBrands: { select: { brandId: true } },
        // US-61: ผูกบัญชี LINE ไว้กี่แบรนด์ (โหมดพนักงานใน LIFF) — ไม่ส่ง lineUserId ออกไป
        lineLinks: { select: { brandId: true } },
      },
    });
    // ไม่ส่ง passwordHash ออกไปเด็ดขาด
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      brandIds: u.adminBrands.map((b) => b.brandId),
      lineLinkedBrandIds: u.lineLinks.map((l) => l.brandId),
      createdAt: u.createdAt,
    }));
  }

  async create(merchantId: string, dto: CreateAdminUserDto) {
    const dup = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (dup) throw new ConflictException('อีเมลนี้ถูกใช้แล้ว');
    if (BRAND_SCOPED.has(dto.role) && !dto.brandIds?.length) {
      throw new BadRequestException('role นี้ต้องระบุแบรนด์ที่ดูแลอย่างน้อย 1 แบรนด์');
    }
    await this.assertBrandsInMerchant(merchantId, dto.brandIds);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: {
        merchantId,
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        adminBrands:
          BRAND_SCOPED.has(dto.role) && dto.brandIds
            ? { create: dto.brandIds.map((brandId) => ({ brandId })) }
            : undefined,
      },
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async update(merchantId: string, id: string, actingAdminId: string, dto: UpdateAdminUserDto) {
    const user = await this.prisma.adminUser.findFirst({ where: { id, merchantId } });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');
    // กัน owner ปิดใช้งาน/ลดสิทธิ์ตัวเอง จน lockout
    if (id === actingAdminId && (dto.isActive === false || (dto.role && dto.role !== 'owner'))) {
      throw new BadRequestException('เปลี่ยนสิทธิ์/ปิดบัญชีตัวเองไม่ได้');
    }
    if (dto.brandIds) await this.assertBrandsInMerchant(merchantId, dto.brandIds);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          name: dto.name,
          role: dto.role,
          isActive: dto.isActive,
        },
      });
      // sync admin_brands ถ้าส่ง brandIds มา (แทนที่ชุดเดิม)
      if (dto.brandIds) {
        await tx.adminBrand.deleteMany({ where: { adminUserId: id } });
        if (dto.brandIds.length) {
          await tx.adminBrand.createMany({
            data: dto.brandIds.map((brandId) => ({ adminUserId: id, brandId })),
          });
        }
      }
      return { id: updated.id, role: updated.role, isActive: updated.isActive };
    });
  }

  /**
   * US-61: เจ้าของสั่งเลิกผูกบัญชี LINE ของพนักงานคนนั้น (มือถือหาย/ลาออก)
   * ปิดบัญชี (isActive=false) ก็กันได้อยู่แล้ว แต่ตัวนี้ไว้ตัดเฉพาะทางเข้าทาง LIFF
   */
  async unlinkLine(merchantId: string, id: string) {
    const user = await this.prisma.adminUser.findFirst({ where: { id, merchantId } });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');
    const r = await this.prisma.adminLineLink.deleteMany({ where: { adminUserId: id } });
    return { unlinked: r.count };
  }

  private async assertBrandsInMerchant(merchantId: string, brandIds?: string[]) {
    if (!brandIds?.length) return;
    const count = await this.prisma.brand.count({
      where: { merchantId, id: { in: brandIds } },
    });
    if (count !== new Set(brandIds).size) {
      throw new BadRequestException('มีแบรนด์ที่ไม่อยู่ใน merchant นี้');
    }
  }
}
