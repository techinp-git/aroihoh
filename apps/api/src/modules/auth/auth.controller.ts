import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LineLoginDto } from './dto/line-login.dto';
import { DevLoginDto } from './dto/dev-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('line')
  login(@Body() dto: LineLoginDto) {
    return this.authService.loginWithLine(dto.idToken, dto.brandId);
  }

  // dev-only (ห้ามเปิด production) — ทดสอบ LIFF ระหว่างยังไม่มี LINE (SETUP-1)
  @Post('dev-login')
  devLogin(@Body() dto: DevLoginDto) {
    if (this.config.get<string>('ALLOW_DEV_LOGIN') !== 'true') {
      throw new ForbiddenException('dev login disabled');
    }
    return this.authService.devLogin(dto.brandId, dto.name);
  }
}
