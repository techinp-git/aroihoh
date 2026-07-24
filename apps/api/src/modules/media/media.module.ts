import { Global, Module } from '@nestjs/common';
import { MediaService } from './media.service';

// Global — line (เก็บรูป) + chat (เสิร์ฟรูป) ใช้ร่วมกัน ไม่ต้อง import ซ้ำทุก module
@Global()
@Module({
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
