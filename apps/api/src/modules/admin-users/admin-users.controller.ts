import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

// US-30: จัดการผู้ใช้แอดมิน — เฉพาะ owner (RBAC)
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminJwt) {
    return this.users.list(admin.merchantId);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminJwt, @Body() dto: CreateAdminUserDto) {
    return this.users.create(admin.merchantId, dto);
  }

  /** US-61: ตัดทางเข้าโหมดพนักงานใน LIFF ของคนนี้ (ลาออก/มือถือหาย) */
  @Delete(':id/line-link')
  unlinkLine(@CurrentAdmin() admin: AdminJwt, @Param('id') id: string) {
    return this.users.unlinkLine(admin.merchantId, id);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminJwt,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.users.update(admin.merchantId, id, admin.sub, dto);
  }
}
