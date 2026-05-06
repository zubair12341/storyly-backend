import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import ws from 'ws';
import * as bodyParser from 'body-parser';

// Polyfill WebSocket
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = ws;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Stripe webhook raw body middleware
  app.use(
    '/billing/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // ✅ Normal JSON parser for all other routes
  app.use(bodyParser.json());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();