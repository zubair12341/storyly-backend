import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { StoriesModule } from './stories/stories.module';
import { WidgetModule } from './widget/widget.module';
// CHANGED: register the new CategoriesModule
import { CategoriesModule } from './categories/categories.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BillingModule } from './billing/billing.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate-limit configs — applied via APP_GUARD in main.ts.
    // widget config is preserved exactly; api/billing/auth configs are new.
    ThrottlerModule.forRoot([
      {
        name: 'widget',
        ttl: 60_000,
        limit: 60,
      },
      {
        name: 'api',
        ttl: 60_000,
        limit: 100,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}