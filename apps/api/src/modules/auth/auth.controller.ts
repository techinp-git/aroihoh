import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LineLoginDto } from './dto/line-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('line')
  login(@Body() dto: LineLoginDto) {
    return this.authService.loginWithLine(dto.idToken, dto.brandId);
  }
}
