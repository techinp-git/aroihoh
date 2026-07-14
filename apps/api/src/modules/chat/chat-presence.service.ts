import { Injectable } from '@nestjs/common';

interface Entry {
  adminId: string;
  name: string;
  ts: number;
}

// US-46: presence ในห้องแชต (in-memory) — กันแอดมินหลายคนตอบชนกัน
// เบา: heartbeat ต่อห้อง + TTL 12s (ไม่ต้อง assignment เต็ม) — single instance
@Injectable()
export class ChatPresenceService {
  private readonly map = new Map<string, Entry[]>(); // customerId -> viewers
  private readonly TTL = 12_000;

  touch(customerId: string, adminId: string, name: string) {
    const now = Date.now();
    const list = (this.map.get(customerId) || []).filter(
      (e) => e.adminId !== adminId && now - e.ts < this.TTL,
    );
    list.push({ adminId, name, ts: now });
    this.map.set(customerId, list);
  }

  /** ชื่อคนอื่นที่กำลังดูห้องนี้ (ไม่รวมตัวเอง) ภายใน TTL */
  viewers(customerId: string, excludeAdminId: string): string[] {
    const now = Date.now();
    return (this.map.get(customerId) || [])
      .filter((e) => e.adminId !== excludeAdminId && now - e.ts < this.TTL)
      .map((e) => e.name);
  }
}
