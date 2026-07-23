import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** US-39: ข้อมูลแบรนด์สาธารณะสำหรับ LIFF (ชื่อ/โลโก้/ธีม) — เฉพาะแบรนด์ที่ active */
  async getPublicBrand(brandId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, isActive: true },
      select: { id: true, name: true, logoUrl: true, theme: true },
    });
    if (!brand) throw new NotFoundException('brand not found');
    return brand;
  }

  /** LIFF: เมนูที่เปิดขาย จัดกลุ่มตามหมวด (US-02 ใช้เลือกใส่ตะกร้า) */
  async getPublicMenu(brandId: string) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { brandId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
          // select ชัดเจน — ห้ามคืน costPrice (US-19 ต้นทุนเป็นความลับทางการค้า ไม่ส่งให้ลูกค้า)
          select: {
            id: true,
            categoryId: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            isAvailable: true,
          },
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
        costPrice: dto.costPrice, // US-19
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

  // US-36b: คัดลอกเมนู (หมวด + item) ข้ามแบรนด์ — setup แบรนด์ใหม่เร็ว (ครัวเดียวเมนูมักซ้ำ)
  // append เข้า target (ไม่ลบของเดิม) · id ใหม่ทั้งหมด · ราคา/ชื่อ snapshot จากต้นทาง ตั้งใหม่ทีหลังได้
  async copyMenu(sourceBrandId: string, targetBrandId: string) {
    if (sourceBrandId === targetBrandId) {
      throw new BadRequestException('แบรนด์ต้นทางและปลายทางต้องต่างกัน');
    }
    const categories = await this.prisma.menuCategory.findMany({
      where: { brandId: sourceBrandId },
      orderBy: { sortOrder: 'asc' },
      include: { items: true },
    });
    const orphanItems = await this.prisma.menuItem.findMany({
      where: { brandId: sourceBrandId, categoryId: null },
    });

    let cats = 0;
    let items = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of categories) {
        const newCat = await tx.menuCategory.create({
          data: { brandId: targetBrandId, name: c.name, sortOrder: c.sortOrder, isActive: c.isActive },
        });
        cats++;
        for (const it of c.items) {
          await tx.menuItem.create({
            data: {
              brandId: targetBrandId, categoryId: newCat.id, name: it.name,
              description: it.description, price: it.price, costPrice: it.costPrice,
              imageUrl: it.imageUrl, isAvailable: it.isAvailable,
            },
          });
          items++;
        }
      }
      for (const it of orphanItems) {
        await tx.menuItem.create({
          data: {
            brandId: targetBrandId, categoryId: null, name: it.name,
            description: it.description, price: it.price, costPrice: it.costPrice,
            imageUrl: it.imageUrl, isAvailable: it.isAvailable,
          },
        });
        items++;
      }
    });
    return { categories: cats, items };
  }

  // กัน cross-tenant: ยืนยันว่า item เป็นของ brand นี้ก่อนแก้/ลบ
  private async assertItem(brandId: string, id: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, brandId } });
    if (!item) throw new NotFoundException('menu item not found in this brand');
    return item;
  }
}
