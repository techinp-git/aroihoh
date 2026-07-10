import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface OrderEvent {
  brandId: string;
  type: 'created' | 'status';
  orderId: string;
  status?: string;
  total?: number;
}

/** in-memory event bus สำหรับ push ออเดอร์แบบ realtime (US-11) — single instance */
@Injectable()
export class OrderEventsService {
  private readonly subject = new Subject<OrderEvent>();

  emit(e: OrderEvent) {
    this.subject.next(e);
  }

  stream(): Observable<OrderEvent> {
    return this.subject.asObservable();
  }
}
