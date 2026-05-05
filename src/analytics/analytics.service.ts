import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AnalyticsService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ─────────────────────────────────────────────
  //  GET /analytics/summary
  // ─────────────────────────────────────────────

  async getSummary(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('events')
      .select('event_type')
      .eq('workspace_id', workspaceId);

    if (error) {
      this.logger.error('Failed to fetch analytics summary', error);
      throw new InternalServerErrorException('Could not retrieve analytics.');
    }

    const storyViews = data.filter((e) => e.event_type === 'story_view').length;
    const slideViews = data.filter((e) => e.event_type === 'slide_view').length;
    const ctaClicks = data.filter((e) => e.event_type === 'cta_click').length;
    const ctr = storyViews > 0 ? ctaClicks / storyViews : 0;

    return {
      story_views: storyViews,
      slide_views: slideViews,
      cta_clicks: ctaClicks,
      ctr: parseFloat(ctr.toFixed(4)),
    };
  }

  // ─────────────────────────────────────────────
  //  GET /analytics/stories/:id
  // ─────────────────────────────────────────────

  async getStoryStats(workspaceId: string, storyId: string) {
    // Fetch story's slide count to determine "last slide" for completion rate
    const { data: story, error: storyError } = await this.supabase
      .from('stories')
      .select('slides')
      .eq('id', storyId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (storyError) {
      this.logger.error('Failed to fetch story for analytics', storyError);
      throw new InternalServerErrorException('Could not retrieve story.');
    }

    const { data: events, error: eventsError } = await this.supabase
      .from('events')
      .select('event_type, slide_index')
      .eq('workspace_id', workspaceId)
      .eq('story_id', storyId);

    if (eventsError) {
      this.logger.error('Failed to fetch story events', eventsError);
      throw new InternalServerErrorException('Could not retrieve analytics.');
    }

    const storyViews = events.filter((e) => e.event_type === 'story_view').length;
    const slideViews = events.filter((e) => e.event_type === 'slide_view').length;
    const ctaClicks = events.filter((e) => e.event_type === 'cta_click').length;

    // Completion = sessions that reached the last slide / story_view count
    // last slide index = slides.length - 1 (slides is a JSONB array)
    let completionRate = 0;
    if (story && Array.isArray(story.slides) && story.slides.length > 0) {
      const lastSlideIndex = story.slides.length - 1;
      const completions = events.filter(
        (e) => e.event_type === 'slide_view' && e.slide_index === lastSlideIndex,
      ).length;
      completionRate = storyViews > 0 ? completions / storyViews : 0;
    }

    return {
      story_id: storyId,
      story_views: storyViews,
      slide_views: slideViews,
      cta_clicks: ctaClicks,
      completion_rate: parseFloat(completionRate.toFixed(4)),
    };
  }
}