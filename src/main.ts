import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ThrottlerGuard } from '@nestjs/throttler';
import ws from 'ws';
import * as bodyParser from 'body-parser';

// Polyfill WebSocket
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = ws;
}

async function bootstrap() {

  // IMPORTANT:
  // Disable Nest default body parser
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Stripe webhook route MUST use raw body
  app.use(
    '/billing/webhook',
    bodyParser.raw({ type: '*/*' }),
  );

  // Normal JSON parser for all OTHER routes
  app.use(bodyParser.json());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global rate-limit guard — all routes get the 'api' throttle by default.
  // Individual controllers/methods override with @Throttle({ <name>: ... }).
  // Webhook is exempt via @SkipThrottle() in billing.controller.ts.
  app.useGlobalGuards(new ThrottlerGuard());

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();