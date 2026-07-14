import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { CustomersService } from './customers.service';
import { SetTagsDto } from './dto/set-tags.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class SetOptOutDto {
  @IsBoolean() optedOut: boolean;
}

// US-45: PII ลูกค้า — kitchen/chat_agent เข้าไม่ได้
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff')
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

  // PDPA: บันทึก opt-out/opt-in รับข่าวสาร
  @Patch(':id/opt-out')
  setOptOut(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('id') id: string,
    @Body() dto: SetOptOutDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.customers.setOptOut(brandId, id, dto.optedOut);
  }
}
