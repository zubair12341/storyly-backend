import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CategoriesService } from '../categories/categories.service';
import { EventItemDto } from './dto/create-events.dto';

const WIDGET_STORY_SELECT = `
  id,
  title,
  category_id,
  cover_image_url,
  logo_url,
  thumbnail_url,
  slides,
  config,
  published_at
`;

// Hard ceiling — prevents accidentally returning thousands of stories
const MAX_LIMIT = 50;

@Injectable()
export class WidgetService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(WidgetService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly categoriesService: CategoriesService,
  ) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ─────────────────────────────────────────────
  //  POST /widget/events — bulk insert, single query
  // ─────────────────────────────────────────────

  async trackEvents(workspaceId: string, events: EventItemDto[]) {
    if (!events?.length) return { inserted: 0 };

    const rows = events.map((e) => ({
      workspace_id: workspaceId,
      story_id:     e.story_id,
      session_id:   e.session_id,
      event_type:   e.event_type,
      slide_index:  e.slide_index ?? null,
      referrer_url: e.referrer_url ?? null,
    }));

    const { error } = await this.supabase.from('events').insert(rows);

    if (error) {
      this.logger.error('Failed to bulk-insert events', error);
      throw new InternalServerErrorException('Could not record events.');
    }

    return { inserted: rows.length };
  }

  // ─────────────────────────────────────────────
  //  GET /widget/stories — optional category + limit
  // ─────────────────────────────────────────────

  async findPublished(
    workspaceId: string,
    categorySlug?: string,
    limit = 0,
  ) {
    let query = this.supabase
      .from('stories')
      .select(WIDGET_STORY_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (categorySlug) {
      const category = await this.categoriesService.findBySlug(
        workspaceId,
        categorySlug,
      );
      if (!category) return [];
      query = query.eq('category_id', category.id);
    }

    // Apply limit — clamp to MAX_LIMIT ceiling
    const effectiveLimit = limit > 0 ? Math.min(limit, MAX_LIMIT) : MAX_LIMIT;
    query = query.limit(effectiveLimit);

    const { data, error } = await query;

    if (error) {
      this.logger.error('Widget: failed to fetch stories', error);
      throw new InternalServerErrorException('Could not retrieve stories.');
    }

    return data;
  }

  // ─────────────────────────────────────────────
  //  GET /widget/stories/:id
  // ─────────────────────────────────────────────

  async findOnePublished(workspaceId: string, storyId: string) {
    const { data: story, error } = await this.supabase
      .from('stories')
      .select(WIDGET_STORY_SELECT)
      .eq('id', storyId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'published')
      .maybeSingle();

    if (error) {
      this.logger.error('Widget: failed to fetch story', error);
      throw new InternalServerErrorException('Could not retrieve story.');
    }

    if (!story) throw new NotFoundException('Story not found.');

    return story;
  }
}