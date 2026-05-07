import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class WorkspacesService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ─────────────────────────────────────────────
  //  GET /workspaces/settings
  // ─────────────────────────────────────────────

  async getSettings(workspaceId: string): Promise<{ allowed_domains: string[] }> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('allowed_domains')
      .eq('id', workspaceId)
      .single();

    if (error) {
      this.logger.error('Failed to fetch workspace settings', error);
      throw new InternalServerErrorException('Could not retrieve workspace settings.');
    }

    return {
      allowed_domains: (data.allowed_domains as string[]) ?? [],
    };
  }

  // ─────────────────────────────────────────────
  //  POST /workspaces/allowed-domains
  // ─────────────────────────────────────────────

  async updateAllowedDomains(
    workspaceId: string,
    domains: string[],
  ): Promise<{ allowed_domains: string[] }> {
    const { error } = await this.supabase
      .from('workspaces')
      .update({ allowed_domains: domains })
      .eq('id', workspaceId);

    if (error) {
      this.logger.error('Failed to update allowed_domains', error);
      throw new InternalServerErrorException('Could not update allowed domains.');
    }

    return { allowed_domains: domains };
  }
}