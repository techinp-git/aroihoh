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
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';
import {
  CopyMenuDto,
  CreateCategoryDto,
  CreateMenuItemDto,
  SetAvailabilityDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

@Controller()
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // ── Public (LIFF) ──
  @Get('menu/:brandId')
  getPublicMenu(@Param('brandId') brandId: string) {
    return this.menu.getPublicMenu(brandId);
  }

  // ── Admin (AdminJwtGuard + brand scope) ──
  @UseGuards(AdminJwtGuard)
  @Get('admin/menu')
  listAll(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.menu.listAll(brandId);
  }

  @UseGuards(AdminJwtGuard)
  @Get('admin/menu/categories')
  listCategories(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.menu.listCategories(brandId);
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/menu/categories')
  createCategory(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateCategoryDto) {
    assertBrandAccess(admin, dto.brandId);
    return this.menu.createCategory(dto);
  }

  @UseGuards(AdminJwtGuard)
  @Post('admin/menu/items')
  createItem(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateMenuItemDto) {
    assertBrandAccess(admin, dto.brandId);
    return this.menu.createItem(dto);
  }

  // US-36b: คัดลอกเมนูข้ามแบรนด์ — ต้องมีสิทธิ์ทั้งต้นทางและปลายทาง
  @UseGuards(AdminJwtGuard)
  @Post('admin/menu/copy')
  copyMenu(@CurrentAdmin() admin: AdminJwt, @Body() dto: CopyMenuDto) {
    assertBrandAccess(admin, dto.sourceBrandId);
    assertBrandAccess(admin, dto.targetBrandId);
    return this.menu.copyMenu(dto.sourceBrandId, dto.targetBrandId);
  }

  @UseGuards(AdminJwtGuard)
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

  @UseGuards(AdminJwtGuard)
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

  @UseGuards(AdminJwtGuard)
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
