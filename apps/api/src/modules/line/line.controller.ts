import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { LineClient } from './line.client';
import { LineService } from './line.service';
import { verifyLineSignature } from './line-signature';

// Webhook LINE — 1 URL ต่อ 1 แบรนด์ (ตั้ง Webhook URL = https://<host>/api/line/webhook/<brandId>)
// ⚠️ ไม่มี JWL guard — ความปลอดภัยคือ x-line-signature (กติกาเหล็ก #3) ห้ามข้าม
@Controller('line/webhook')
export class LineController {
  private readonly log = new Logger('LineWebhook');

  constructor(
    private readonly line: LineClient,
    private readonly service: LineService,
  ) {}

  @Post(':brandId')
  @HttpCode(200) // LINE ต้องได้ 200 ถึงจะถือว่าสำเร็จ
  async webhook(
    @Param('brandId') brandId: string,
    @Headers('x-line-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // DIAGNOSTIC: log ทุกครั้งที่มี request มาถึง webhook (ดูว่า LINE ยิงมาถึงไหม)
    this.log.log(`hit brand=${brandId} sigPresent=${!!signature} bodyLen=${req.rawBody?.length ?? 0}`);
    const { channelSecret } = await this.line.config(brandId);
    if (!channelSecret) {
      this.log.warn('reject: brand has no channel secret');
      throw new UnauthorizedException('brand has no LINE channel secret');
    }

    const raw = req.rawBody ?? Buffer.from('');
    if (!verifyLineSignature(channelSecret, raw, signature)) {
      this.log.warn('reject: signature mismatch (secret อาจไม่ตรง channel)');
      throw new UnauthorizedException('invalid x-line-signature'); // #3 verify ทุก event
    }
    this.log.log('signature OK → dispatch events');

    const body = req.body as { events?: unknown[] };
    await this.service.handleEvents(brandId, (body?.events ?? []) as never[]);
    return { ok: true };
  }
}
