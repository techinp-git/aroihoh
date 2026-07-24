import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import type { AdminJwt } from '../../common/guards/admin-jwt.guard';
import { assertBrandAccess } from '../../common/admin-scope';
import { contentTypeForName } from '../media/media.filename';

/**
 * เสิร์ฟรูปในแชต — ต้องเป็น admin ที่มีสิทธิ์แบรนด์นั้น
 *
 * <img> ส่ง Authorization header ไม่ได้ → รับ admin JWT ผ่าน `?token=` แล้ว verify เอง
 * (pattern เดียวกับ SSE order/kitchen stream) · ตรวจว่ารูปเป็นของแบรนด์ที่ผู้ใช้เข้าถึงได้จริง
 * ก่อนคืนไฟล์ กัน admin แบรนด์อื่นดึงรูปข้ามแบรนด์
 */
@Controller('admin/chat/media')
export class ChatMediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly config: ConfigService,
  ) {}

  @Get(':messageId')
  @Header('Cache-Control', 'private, max-age=86400') // รูปไม่เปลี่ยน cache ได้ (private = ไม่ให้ proxy กลาง cache)
  async serve(
    @Param('messageId') messageId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new UnauthorizedException('ADMIN_JWT_SECRET not configured');
    let admin: AdminJwt;
    try {
      admin = jwt.verify(token || '', secret) as AdminJwt;
      if (admin.typ !== 'admin') throw new Error('not admin');
    } catch {
      throw new UnauthorizedException('invalid token');
    }

    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { brandId: true, imagePath: true },
    });
    if (!msg?.imagePath) throw new NotFoundException('ไม่พบรูป');
    assertBrandAccess(admin, msg.brandId); // กันดึงรูปข้ามแบรนด์

    const full = this.media.resolveExisting(msg.imagePath);
    if (!full) throw new NotFoundException('ไฟล์รูปหาย');

    res.setHeader('Content-Type', contentTypeForName(msg.imagePath));
    this.media.stream(full).pipe(res);
  }
}
