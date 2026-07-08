import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerJwt } from '../guards/jwt-auth.guard';

/** ดึง payload ลูกค้าที่ผ่าน JwtAuthGuard มาแล้ว (req.customer) */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerJwt => {
    return ctx.switchToHttp().getRequest().customer;
  },
);
