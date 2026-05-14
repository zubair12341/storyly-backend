import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { StoriesModule } from './stories/stories.module';
import { WidgetModule } from './widget/widget.module';
import { CategoriesModule } from './categories/categories.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BillingModule } from './billing/billing.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate-limit configs — ThrottlerGuard registered below as APP_GUARD.
    // widget config preserved exactly; api/billing/auth configs are new.
    ThrottlerModule.forRoot([
      {
        name: 'widget',
        ttl: 60_000,
        limit: 300,   // raised: widget.js reloads + multiple embeds per visitor
      },
      {
        name: 'api',
        ttl: 60_000,
        limit: 300,   // raised: dashboard hot-reloads in dev exhaust this fast
      },
      {
        name: 'billing',
        ttl: 60_000,
        limit: 10,
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 5,
      },
    ]),
    AuthModule,
    ApiKeysModule,
    StoriesModule,
    CategoriesModule,
    WidgetModule,
    MediaModule,
    AnalyticsModule,
    BillingModule,
    WorkspacesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global ThrottlerGuard — NestJS DI injects all required constructor args.
    // All routes get the default 'api' throttle unless overridden with @Throttle().
    // Webhook is exempt via @SkipThrottle() in billing.controller.ts.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}