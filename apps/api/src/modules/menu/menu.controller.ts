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
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import {
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

  // ── Admin (⚠️ AdminKeyGuard ชั่วคราว — รอ admin auth จริง) ──
  @UseGuards(AdminKeyGuard)
  @Get('admin/menu')
  listAll(@Query('brandId') brandId: string) {
    return this.menu.listAll(brandId);
  }

  @UseGuards(AdminKeyGuard)
  @Post('admin/menu/categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(dto);
  }

  @UseGuards(AdminKeyGuard)
  @Post('admin/menu/items')
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(dto);
  }

  @UseGuards(AdminKeyGuard)
  @Patch('admin/menu/items/:id')
  updateItem(
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(brandId, id, dto);
  }

  @UseGuards(AdminKeyGuard)
  @Patch('admin/menu/items/:id/availability')
  setAvailability(
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.menu.setAvailability(brandId, id, dto.isAvailable);
  }

  @UseGuards(AdminKeyGuard)
  @Delete('admin/menu/items/:id')
  deleteItem(@Query('brandId') brandId: string, @Param('id') id: string) {
    return this.menu.deleteItem(brandId, id);
  }
}
