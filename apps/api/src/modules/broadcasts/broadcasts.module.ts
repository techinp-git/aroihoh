import { Module } from '@nestjs/common';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { AudiencesModule } from '../audiences/audiences.module';
import { ContentModule } from '../content/content.module';
import { LineModule } from '../line/line.module';

@Module({
  imports: [AudiencesModule, ContentModule, LineModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
})
export class BroadcastsModule {}
