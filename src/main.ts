import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import ws from 'ws';
import * as express from 'express'; // ✅ added

// Polyfill WebSocket
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = ws;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ✅ Stripe webhook raw body (CRITICAL)
  app.use('/billing/webhook', express.raw({ type: 'application/json' }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // ✅ TEMP: allow all origins
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();