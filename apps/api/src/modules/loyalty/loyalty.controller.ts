import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CreateRedemptionDto, EarnDto } from './dto/loyalty.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { CustomerJwt } from '../../common/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';

/**
 * US-50: ฝั่งลูกค้า (LIFF) — สแกนรับแต้ม / ดูแต้ม / ขอคูปองแลกรางวัล
 * brandId + customerId มาจาก JWT เสมอ ไม่มี endpoint ไหนรับจาก client
 */
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  private scope(c: CustomerJwt) {
    return { customerId: c.sub, brandId: c.brandId };
  }

  @Post('earn')
  earn(@CurrentCustomer() c: CustomerJwt, @Body() dto: EarnDto) {
    return this.loyalty.earn(this.scope(c), dto.code);
  }

  @Get('me')
  me(@CurrentCustomer() c: CustomerJwt) {
    return this.loyalty.me(this.scope(c));
  }

  @Get('rewards')
  rewards(@CurrentCustomer() c: CustomerJwt) {
    return this.loyalty.listRewards(this.scope(c));
  }

  @Post('redemptions')
  redeem(@CurrentCustomer() c: CustomerJwt, @Body() dto: CreateRedemptionDto) {
    return this.loyalty.createRedemption(this.scope(c), dto.rewardId);
  }

  @Get('redemptions/:id')
  redemption(@CurrentCustomer() c: CustomerJwt, @Param('id') id: string) {
    return this.loyalty.getRedemption(this.scope(c), id);
  }

  @Post('redemptions/:id/cancel')
  cancel(@CurrentCustomer() c: CustomerJwt, @Param('id') id: string) {
    return this.loyalty.cancelRedemption(this.scope(c), id);
  }
}
