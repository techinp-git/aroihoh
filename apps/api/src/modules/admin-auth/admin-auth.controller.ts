import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import {
  AdminLineLinkDto,
  AdminLineLoginDto,
  AdminLineUnlinkDto,
} from './dto/admin-line.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /**
   * US-61 โหมดพนักงานใน LIFF — ล็อกอินด้วยบัญชี LINE ที่ผูกไว้แล้ว (ไม่ต้องพิมพ์รหัสผ่านซ้ำ)
   * LIFF ยิงตัวนี้เงียบ ๆ ทุกครั้งที่เปิด: ลูกค้าทั่วไปได้ 404 แล้วไม่เห็นแท็บพนักงาน
   */
  @Post('line')
  loginWithLine(@Body() dto: AdminLineLoginDto) {
    return this.auth.loginWithLine(dto.idToken, dto.brandId);
  }

  /** ผูกบัญชี LINE เข้ากับแอดมินที่ล็อกอินอยู่ — ต้องมี admin JWT (รู้รหัสผ่าน) ก่อนเสมอ */
  @UseGuards(AdminJwtGuard)
  @Post('line/link')
  linkLine(@CurrentAdmin() admin: AdminJwt, @Body() dto: AdminLineLinkDto) {
    return this.auth.linkLine(admin.sub, dto.idToken, dto.brandId);
  }

  @UseGuards(AdminJwtGuard)
  @Post('line/unlink')
  unlinkLine(@CurrentAdmin() admin: AdminJwt, @Body() dto: AdminLineUnlinkDto) {
    return this.auth.unlinkLine(admin.sub, dto.brandId);
  }

  @UseGuards(AdminJwtGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminJwt) {
    return this.auth.me(admin.sub);
  }
}
