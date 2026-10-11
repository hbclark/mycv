import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieSession from 'cookie-session';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    cookieSession({
      keys: ['mycv-secret-key'],
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //whitelist: true 会自动剔除DTO 里没声明的多余字段（例如前端塞进来的 isAdmin: true），生产里强烈建议打开。
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
