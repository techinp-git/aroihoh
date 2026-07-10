import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { SetHoursDto, SetPauseDto } from './dto/store.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

@UseGuards(AdminJwtGuard)
@Controller('admin/store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  get(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string) {
    assertBrandAccess(admin, brandId);
    return this.store.getStore(brandId);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'manager')
  @Patch('pause')
  pause(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: SetPauseDto) {
    assertBrandAccess(admin, brandId);
    return this.store.setPause(brandId, dto.isOpen);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'manager')
  @Patch('hours')
  hours(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId: string, @Body() dto: SetHoursDto) {
    assertBrandAccess(admin, brandId);
    return this.store.setHours(brandId, dto.openTime ?? null, dto.closeTime ?? null);
  }
}
