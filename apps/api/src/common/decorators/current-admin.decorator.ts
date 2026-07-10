import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminJwt } from '../guards/admin-jwt.guard';

/** ดึง admin ที่ผ่าน AdminJwtGuard มาแล้ว (req.admin) */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwt =>
    ctx.switchToHttp().getRequest().admin,
);
