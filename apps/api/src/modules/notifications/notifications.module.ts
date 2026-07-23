import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { NotificationsService } from './notifications.service';

/** US-09: คิวแจ้งเตือน LINE (BullMQ) — LineModule ให้ LineClient */
@Module({
  imports: [LineModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
