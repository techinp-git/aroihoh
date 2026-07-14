import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type AdminRole = 'owner' | 'manager' | 'staff' | 'kitchen' | 'chat_agent';

export interface AdminJwt {
  sub: string; // adminUserId
  merchantId: string;
  role: AdminRole;
  brandIds: string[]; // แบรนด์ที่ผู้ใช้คนนี้เข้าถึงได้ (owner/manager = ทุกแบรนด์ของ merchant)
  typ: 'admin';
}

/** ป้องกัน /api/admin/* ด้วย admin JWT จริง (แทน AdminKeyGuard ชั่วคราว) — US-29 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) {
      // fail-fast: ห้าม boot/รับ traffic โดยไม่มี secret จริง
      throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');
    }
    try {
      const payload = jwt.verify(header.slice(7), secret) as AdminJwt;
      if (payload.typ !== 'admin') throw new Error('not an admin token');
      req.admin = payload;
    } catch {
      throw new UnauthorizedException('invalid admin token');
    }
    return true;
  }
}
