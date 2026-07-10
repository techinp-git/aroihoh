import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // fail-fast: ห้าม boot ด้วย secret เดา ๆ (เดิม fallback 'change-me' = ปลอมได้)
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return { secret, signOptions: { expiresIn: '30d' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule], // ให้ module อื่นใช้ JwtAuthGuard ได้ (verify customer JWT)
})
export class AuthModule {}
