import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineClient } from './line.client';
import { LineService } from './line.service';

@Module({
  controllers: [LineController],
  providers: [LineClient, LineService],
  exports: [LineClient, LineService],
})
export class LineModule {}
