import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @UseGuards(AdminJwtGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminJwt) {
    return this.auth.me(admin.sub);
  }
}
