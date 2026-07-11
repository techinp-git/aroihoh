import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LineModule } from '../line/line.module';

@Module({
  imports: [LineModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
