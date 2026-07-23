import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { encryptionKeyConfigured } from './common/crypto';

async function bootstrap() {
  // SEC-1: prod ต้องตั้ง ENCRYPTION_KEY ไม่งั้น LINE secret/token ถูกเก็บ plaintext
  if (process.env.NODE_ENV === 'production' && !encryptionKeyConfigured()) {
    new Logger('Bootstrap').error(
      '⚠️ ENCRYPTION_KEY ไม่ได้ตั้งใน production — LINE secret/token จะถูกเก็บแบบ plaintext! ตั้งด้วย `openssl rand -hex 32`',
    );
  }
  // rawBody: true → เก็บ Buffer ดิบไว้ที่ req.rawBody สำหรับ verify x-line-signature (กติกาเหล็ก #3)
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // แปลง body เป็น class instance เพื่อ validate nested DTO (orders)
    }),
  );
  // LIFF/Admin รันคนละ origin ตอน dev — production ให้ล็อก origin จริงผ่าน env
  // CORS_ORIGINS = รายการ origin คั่นด้วย comma (เช่น https://aroihoh-order.jivecode.click,https://aroihoh-admin.jivecode.click)
  // ไม่ตั้ง = อนุญาตทุก origin (dev เท่านั้น) — prod ต้องตั้งเสมอ
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
