import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ApiKeysModule,
    StoriesModule,
    CategoriesModule,
    WidgetModule,
    MediaModule,
    AnalyticsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}