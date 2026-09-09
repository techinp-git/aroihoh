import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineConfigController } from './line-config.controller';
import { RichMenuController, RichMenuImageController } from './rich-menu.controller';
import { LineClient } from './line.client';
import { LineService } from './line.service';
import { LineConfigService } from './line-config.service';
import { RichMenuService } from './rich-menu.service';

@Module({
  controllers: [LineController, LineConfigController, RichMenuController, RichMenuImageController],
  providers: [LineClient, LineService, LineConfigService, RichMenuService],
  exports: [LineClient, LineService, RichMenuService],
})
export class LineModule {}
