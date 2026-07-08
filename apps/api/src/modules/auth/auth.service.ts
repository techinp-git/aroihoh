import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyLineIdToken } from './line-verify';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // US-01: verify LINE ID token → upsert customer → ออก app JWT
  async loginWithLine(idToken: string, brandId: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.isActive) {
      throw new NotFoundException('brand not found or inactive');
    }
    if (!brand.lineChannelId) {
      throw new UnauthorizedException('brand has no LINE channel configured');
    }

    let payload;
    try {
      payload = await verifyLineIdToken(idToken, brand.lineChannelId);
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof Error ? e.message : 'invalid LINE id token',
      );
    }

    const customer = await this.prisma.customer.upsert({
      where: {
        brandId_lineUserId: { brandId, lineUserId: payload.sub },
      },
      create: {
        brandId,
        lineUserId: payload.sub,
        displayName: payload.name,
        pictureUrl: payload.picture,
      },
      update: {
        displayName: payload.name,
        pictureUrl: payload.picture,
      },
    });

    const accessToken = await this.jwt.signAsync({
      sub: customer.id,
      brandId,
      lineUserId: payload.sub,
    });

    return {
      accessToken,
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        pictureUrl: customer.pictureUrl,
      },
    };
  }
}
