import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ⚠️ ชั่วคราว: ป้องกัน endpoint ฝั่งแอดมินด้วย shared key (header x-admin-key)
 * ต้องถูกแทนที่ด้วย admin auth จริง (admin_users email/password + role) — ดู EP-05/US-26
 * ไม่ใช้ customer JWT ป้องกัน endpoint แอดมินเด็ดขาด (คนละ trust level)
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('ADMIN_API_KEY not configured');
    }
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['x-admin-key'] !== expected) {
      throw new UnauthorizedException('invalid admin key');
    }
    return true;
  }
}
