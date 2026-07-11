import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
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
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
