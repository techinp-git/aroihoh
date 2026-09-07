import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { SaveAddressDto, UpdateAddressDto } from './dto/save-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { CustomerJwt } from '../../common/guards/jwt-auth.guard';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';

/**
 * US-58: โปรไฟล์ + สมุดที่อยู่ของลูกค้า (LIFF)
 * ทุก endpoint ผูกกับ customerId/brandId จาก JWT เท่านั้น — ไม่มี path ไหนรับ customerId จาก client
 */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  private scope(c: CustomerJwt) {
    return { customerId: c.sub, brandId: c.brandId };
  }

  @Get('profile')
  get(@CurrentCustomer() customer: CustomerJwt) {
    return this.profile.getProfile(this.scope(customer));
  }

  @Patch('profile')
  update(@CurrentCustomer() customer: CustomerJwt, @Body() dto: UpdateProfileDto) {
    return this.profile.updateProfile(this.scope(customer), dto);
  }

  @Get('addresses')
  listAddresses(@CurrentCustomer() customer: CustomerJwt) {
    return this.profile.listAddresses(this.scope(customer));
  }

  @Post('addresses')
  createAddress(@CurrentCustomer() customer: CustomerJwt, @Body() dto: SaveAddressDto) {
    return this.profile.createAddress(this.scope(customer), dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentCustomer() customer: CustomerJwt,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.profile.updateAddress(this.scope(customer), id, dto);
  }

  @Delete('addresses/:id')
  removeAddress(@CurrentCustomer() customer: CustomerJwt, @Param('id') id: string) {
    return this.profile.removeAddress(this.scope(customer), id);
  }
}
