import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { WidgetService } from './widget.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { CreateEventsDto } from './dto/create-events.dto';
import { PlanViewGuard } from '../billing/plan.guard';

@Controller('widget')
@UseGuards(ApiKeyGuard)
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  /**
   * POST /widget/events
   * Bulk-inserts events in a single query. Tighter rate limit than stories.
   */
  @Post('events')
  @UseGuards(PlanViewGuard)
  @HttpCode(HttpStatus.CREATED)
  // 120 event batches per minute per IP — generous for real usage, blocks hammering
  @Throttle({ widget: { ttl: 60_000, limit: 120 } })
  trackEvents(
    @Req() req: Request & { workspace: { workspaceId: string } },
    @Body() dto: CreateEventsDto,
  ) {
    return this.widgetService.trackEvents(req.workspace.workspaceId, dto.events);
  }

  /**
   * GET /widget/stories
   * GET /widget/stories?category=<slug>&limit=<n>
   */
  @Get('stories')
  @Throttle({ widget: { ttl: 60_000, limit: 60 } })
  findAll(
    @Req() req: Request & { workspace: { workspaceId: string } },
    @Query('category') category?: string,
    // data-limit from widget script tag (0 = no limit)
    @Query('limit', new DefaultValuePipe(0), ParseIntPipe) limit?: number,
  ) {
    return this.widgetService.findPublished(
      req.workspace.workspaceId,
      category,
      limit,
    );
  }

  /**
   * GET /widget/stories/:id
   */
  @Get('stories/:id')
  @Throttle({ widget: { ttl: 60_000, limit: 60 } })
  findOne(
    @Req() req: Request & { workspace: { workspaceId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.widgetService.findOnePublished(req.workspace.workspaceId, id);
  }
}