import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendChatDto } from './dto/send-chat.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

@UseGuards(AdminJwtGuard)
@Controller('admin/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ⚠️ ต้องมาก่อน :customerId (ไม่งั้น 'conversations' จะไปชน param)
  // US-40: Chat Center เดียวรวมทุกแบรนด์ — ไม่ส่ง brandId = ทุกแบรนด์ที่ admin มีสิทธิ์
  @Get('conversations')
  conversations(@CurrentAdmin() admin: AdminJwt, @Query('brandId') brandId?: string) {
    if (brandId) {
      assertBrandAccess(admin, brandId);
      return this.chat.conversations([brandId]);
    }
    return this.chat.conversations(admin.brandIds);
  }

  @Get(':customerId')
  thread(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('customerId') customerId: string,
  ) {
    assertBrandAccess(admin, brandId);
    return this.chat.thread(brandId, customerId);
  }

  @Post(':customerId')
  send(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('customerId') customerId: string,
    @Body() dto: SendChatDto,
  ) {
    assertBrandAccess(admin, brandId);
    return this.chat.send(brandId, customerId, admin.sub, dto.text);
  }
}
