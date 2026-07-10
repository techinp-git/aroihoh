import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { SetTagsDto } from './dto/set-tags.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

@UseGuards(AdminJwtGuard)
@Controller('admin/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Query('q') q?: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.customers.list(brandId, q);
  }

  @Get(':id')
  detail(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.customers.detail(brandId, id);
  }

  @Patch(':id/tags')
  setTags(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: SetTagsDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.customers.setTags(brandId, id, dto.tags);
  }
}
