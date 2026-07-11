import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineConfigController } from './line-config.controller';
import { LineClient } from './line.client';
import { LineService } from './line.service';
import { LineConfigService } from './line-config.service';

@Module({
  controllers: [LineController, LineConfigController],
  providers: [LineClient, LineService, LineConfigService],
  exports: [LineClient, LineService],
})
export class LineModule {}
