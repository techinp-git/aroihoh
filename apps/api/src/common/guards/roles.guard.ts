import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AdminRole } from '../guards/admin-jwt.guard';

/** ตรวจ role ของ admin (ต้องมาหลัง AdminJwtGuard ที่ set req.admin) */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    if (!req.admin || !roles.includes(req.admin.role)) {
      throw new ForbiddenException('สิทธิ์ไม่เพียงพอ');
    }
    return true;
  }
}
