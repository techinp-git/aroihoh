import { Module } from '@nestjs/common';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { AudiencesModule } from '../audiences/audiences.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [AudiencesModule, ContentModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
})
export class BroadcastsModule {}
