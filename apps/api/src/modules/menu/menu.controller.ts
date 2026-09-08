import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';
import {
  CopyMenuDto,
  CreateCategoryDto,
  CreateMenuItemDto,
  SetAvailabilityDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

// US-45: เมนูเป็นงานของหน้าร้าน — ครัว/แอดมินแชตไม่ควรแก้ราคาหรือลบเมนูได้
// (ตรงกับ NAV ในหน้า admin ที่โชว์เมนูนี้ให้ owner/manager/staff เท่านั้น)
// @Roles ระดับคลาสมีผลเฉพาะ route ที่ใส่ RolesGuard ไว้ → route สาธารณะข้างล่างไม่กระทบ
@Roles('owner', 'manager', 'staff')
@Controller()
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // ── Public (LIFF) ──
  @Get('brand/:brandId')
  getPublicBrand(@Param('brandId') brandId: string) {
    return this.menu.getPublicBrand(brandId);
  }

  @Get('menu/:brandId')
  getPublicMenu(@Param('brandId') brandId: string) {
    return this.menu.getPublicMenu(brandId);
  }

  // ── Admin (AdminJwtGuard + brand scope) ──
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Get('admin/menu')
  listAll(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.menu.listAll(brandId);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Get('admin/menu/categories')
  listCategories(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.menu.listCategories(brandId);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Post('admin/menu/categories')
  createCategory(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateCategoryDto) {
    assertBrandAccess(admin, dto.brandId);
    return this.menu.createCategory(dto);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Post('admin/menu/items')
  createItem(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateMenuItemDto) {
    assertBrandAccess(admin, dto.brandId);
    return this.menu.createItem(dto);
  }

  // US-36b: คัดลอกเมนูข้ามแบรนด์ — ต้องมีสิทธิ์ทั้งต้นทางและปลายทาง
  @UseGuards(AdminJwtGuard, RolesGuard)
  @Post('admin/menu/copy')
  copyMenu(@CurrentAdmin() admin: AdminJwt, @Body() dto: CopyMenuDto) {
    assertBrandAccess(admin, dto.sourceBrandId);
    assertBrandAccess(admin, dto.targetBrandId);
    return this.menu.copyMenu(dto.sourceBrandId, dto.targetBrandId);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Patch('admin/menu/items/:id')
  updateItem(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.menu.updateItem(brandId, id, dto);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Patch('admin/menu/items/:id/availability')
  setAvailability(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.menu.setAvailability(brandId, id, dto.isAvailable);
  }

  @UseGuards(AdminJwtGuard, RolesGuard)
  @Delete('admin/menu/items/:id')
  deleteItem(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.menu.deleteItem(brandId, id);
  }
}
