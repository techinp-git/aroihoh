import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ChatService } from './chat.service';
import { ChatPresenceService } from './chat-presence.service';
import { SendChatDto } from './dto/send-chat.dto';
import { AdminJwtGuard, type AdminJwt } from '../../common/guards/admin-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { assertBrandAccess } from '../../common/admin-scope';

class PresenceDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
}

// US-45: chat_agent เข้าได้ (+ role ทั่วไป) — kitchen เข้าไม่ได้
@UseGuards(AdminJwtGuard, RolesGuard)
@Roles('owner', 'manager', 'staff', 'chat_agent')
@Controller('admin/chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly presence: ChatPresenceService,
  ) {}

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

  // US-46: heartbeat presence ในห้อง — คืนชื่อคนอื่นที่กำลังดูห้องนี้ (กันตอบชนกัน)
  @Post(':customerId/presence')
  heartbeat(
    @CurrentAdmin() admin: AdminJwt,
    @Query('brandId') brandId: string,
    @Param('customerId') customerId: string,
    @Body() dto: PresenceDto,
  ) {
    assertBrandAccess(admin, brandId);
    this.presence.touch(customerId, admin.sub, dto.name || 'แอดมิน');
    return { viewers: this.presence.viewers(customerId, admin.sub) };
  }
}
