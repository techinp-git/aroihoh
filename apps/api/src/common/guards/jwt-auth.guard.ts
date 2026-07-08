import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CustomerJwt {
  sub: string; // customerId
  brandId: string;
  lineUserId: string;
}

/** ป้องกัน route ฝั่งลูกค้า — ต้องมี Bearer app JWT ที่ออกจาก /api/auth/line */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      req.customer = await this.jwt.verifyAsync<CustomerJwt>(header.slice(7));
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    return true;
  }
}
