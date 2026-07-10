import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** LIFF: เมนูที่เปิดขาย จัดกลุ่มตามหมวด (US-02 ใช้เลือกใส่ตะกร้า) */
  async getPublicMenu(brandId: string) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { brandId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    return categories;
  }

  /** Admin: เมนูทั้งหมด (รวมที่ปิดขาย) — ทุก query กรอง brandId */
  listAll(brandId: string) {
    return this.prisma.menuItem.findMany({
      where: { brandId },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });
  }

  /** Admin: หมวดเมนูทั้งหมดของแบรนด์ (ใช้จัดกลุ่ม + assign ตอนสร้าง/แก้ item) */
  listCategories(brandId: string) {
    return this.prisma.menuCategory.findMany({
      where: { brandId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({
      data: { brandId: dto.brandId, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  createItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({
      data: {
        brandId: dto.brandId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl,
      },
    });
  }

  async updateItem(brandId: string, id: string, dto: UpdateMenuItemDto) {
    await this.assertItem(brandId, id);
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  /** US-14: เปิด/ปิดขายทันที */
  async setAvailability(brandId: string, id: string, isAvailable: boolean) {
    await this.assertItem(brandId, id);
    return this.prisma.menuItem.update({ where: { id }, data: { isAvailable } });
  }

  async deleteItem(brandId: string, id: string) {
    await this.assertItem(brandId, id);
    await this.prisma.menuItem.delete({ where: { id } });
    return { deleted: true };
  }

  // กัน cross-tenant: ยืนยันว่า item เป็นของ brand นี้ก่อนแก้/ลบ
  private async assertItem(brandId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, brandId } });
    if (!item) throw new NotFoundException('menu item not found in this brand');
    return item;
  }
}
