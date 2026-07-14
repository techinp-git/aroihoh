import {
  Controller,
  MessageEvent,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { OrderEventsService } from './order-events.service';
import type { AdminJwt } from '../../common/guards/admin-jwt.guard';
import { assertBrandAccess } from '../../common/admin-scope';

@Controller()
export class OrderStreamController {
  constructor(
    private readonly events: OrderEventsService,
    private readonly config: ConfigService,
  ) {}

  // US-11: SSE stream ออเดอร์ realtime ต่อแบรนด์
  // EventSource ส่ง Authorization header ไม่ได้ → รับ admin JWT ผ่าน query แล้ว verify เอง
  @Sse('admin/orders/stream')
  stream(
    @Query('brandId') brandId: string,
    @Query('token') token: string,
  ): Observable<MessageEvent> {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');
    let admin: AdminJwt;
    try {
      admin = jwt.verify(token || '', secret) as AdminJwt;
      if (admin.typ !== 'admin') throw new Error('not admin');
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    assertBrandAccess(admin, brandId);

    return this.events.stream().pipe(
      filter((e) => e.brandId === brandId),
      map((e) => ({ data: e }) as MessageEvent),
    );
  }

  // US-37: SSE จอครัว — รวมทุกแบรนด์ที่ admin มีสิทธิ์ (ไม่ผูก brandId เดี่ยว)
  @Sse('admin/kitchen/stream')
  kitchenStream(@Query('token') token: string): Observable<MessageEvent> {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');
    let admin: AdminJwt;
    try {
      admin = jwt.verify(token || '', secret) as AdminJwt;
      if (admin.typ !== 'admin') throw new Error('not admin');
    } catch {
      throw new UnauthorizedException('invalid token');
    }
    const allowed = new Set(admin.brandIds);
    return this.events.stream().pipe(
      filter((e) => allowed.has(e.brandId)),
      map((e) => ({ data: e }) as MessageEvent),
    );
  }
}
