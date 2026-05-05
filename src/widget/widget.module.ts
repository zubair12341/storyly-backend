import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { WidgetService } from './widget.service';
import { WidgetController } from './widget.controller';
import { WidgetServeController } from './widget-serve.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { CategoriesModule } from '../categories/categories.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    ConfigModule,
    ApiKeysModule,
    CategoriesModule,
    BillingModule,
    // Rate limiting: 60 requests per minute per IP on widget endpoints
    ThrottlerModule.forRoot([
      {
        name: 'widget',
        ttl: 60_000, // 1 minute window
        limit: 60,   // max 60 requests per window
      },
    ]),
  ],
  controllers: [
    WidgetServeController, // GET /widget/v1/widget.js (public, no auth)
    WidgetController,      // GET/POST /widget/stories|events (api-key auth)
  ],
  providers: [
    WidgetService,
    // Apply ThrottlerGuard to all routes in this module
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class WidgetModule {}