import { Module } from '@nestjs/common';
import { PreorderController, PreorderSummaryController } from './preorder.controller';
import { PreorderPublicController } from './preorder-public.controller';
import { PreorderService } from './preorder.service';

// US-22: สั่งล่วงหน้า D-1 — OrdersModule/KitchensModule import ตัวนี้เพื่อใช้ PreorderService
@Module({
  controllers: [PreorderController, PreorderSummaryController, PreorderPublicController],
  providers: [PreorderService],
  exports: [PreorderService],
})
export class PreorderModule {}
