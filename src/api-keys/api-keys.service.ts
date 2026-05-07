import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const BCRYPT_ROUNDS = 10; // Lower than passwords — keys are long random strings
const KEY_PREFIX    = 'swp_live_';
const CACHE_TTL_MS  = 300_000; // 5 minutes

interface CacheEntry {
  workspaceId: string;
  allowedDomains: string[];
  expiresAt: number;
}

export interface ValidateResult {
  workspaceId: string;
  allowedDomains: string[];
}

@Injectable()
export class ApiKeysService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(ApiKeysService.name);

  /** In-memory cache: rawKey → { workspaceId, allowedDomains, expiresAt } */
  private readonly validationCache = new Map<string, CacheEntry>();

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ─────────────────────────────────────────────
  //  Create
  // ─────────────────────────────────────────────

  async create(workspaceId: string, dto: CreateApiKeyDto) {
    const rawKey    = KEY_PREFIX + crypto.randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash   = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const { data, error } = await this.supabase
      .from('api_keys')
      .insert({
        workspace_id: workspaceId,
        name:         dto.name,
        key_hash:     keyHash,
        key_prefix:   keyPrefix,
        is_active:    true,
      })
      .select('id, name, key_prefix, is_active, created_at')
      .single();

    if (error) {
      this.logger.error('Failed to create API key', error);
      throw new InternalServerErrorException('Could not create API key.');
    }

    // Return raw key ONCE — never stored, never retrievable again
    return {
      ...data,
      key:     rawKey,
      message: 'Store this key safely. It will not be shown again.',
    };
  }

  // ─────────────────────────────────────────────
  //  List
  // ─────────────────────────────────────────────

  async findAll(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('id, name, key_prefix, is_active, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to list API keys', error);
      throw new InternalServerErrorException('Could not retrieve API keys.');
    }

    return data;
  }

  // ─────────────────────────────────────────────
  //  Delete
  // ─────────────────────────────────────────────

  async remove(workspaceId: string, keyId: string) {
    const { data: existing, error: fetchError } = await this.supabase
      .from('api_keys')
      .select('id, workspace_id')
      .eq('id', keyId)
      .maybeSingle();

    if (fetchError) {
      this.logger.error('Failed to fetch API key for deletion', fetchError);
      throw new InternalServerErrorException('Could not process request.');
    }

    if (!existing) {
      throw new NotFoundException('API key not found.');
    }

    if (existing.workspace_id !== workspaceId) {
      throw new ForbiddenException('You do not have access to this API key.');
    }

    const { error: deleteError } = await this.supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId);

    if (deleteError) {
      this.logger.error('Failed to delete API key', deleteError);
      throw new InternalServerErrorException('Could not delete API key.');
    }

    return { message: 'API key deleted successfully.' };
  }

  // ─────────────────────────────────────────────
  //  Validate (used by ApiKeyGuard)
  // ─────────────────────────────────────────────

  async validate(rawKey: string): Promise<ValidateResult | null> {
    if (!rawKey?.startsWith(KEY_PREFIX)) return null;

    // ── Cache check ──────────────────────────────────────────────
    const cached = this.validationCache.get(rawKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return { workspaceId: cached.workspaceId, allowedDomains: cached.allowedDomains };
      }
      // Expired — evict and fall through to bcrypt
      this.validationCache.delete(rawKey);
    }

    // ── Cache miss: bcrypt path ──────────────────────────────────
    const keyPrefix = rawKey.substring(0, 12);

    // 1. Narrow candidates by prefix (fast index lookup)
    const { data: candidates, error: keyError } = await this.supabase
      .from('api_keys')
      .select('id, workspace_id, key_hash')
      .eq('key_prefix', keyPrefix)
      .eq('is_active', true);

    if (keyError) {
      this.logger.error('Failed to fetch API key candidates during validation', keyError);
      return null;
    }

    if (!candidates?.length) return null;

    // 2. bcrypt compare against each candidate (usually just one)
    for (const candidate of candidates) {
      const match = await bcrypt.compare(rawKey, candidate.key_hash);
      if (match) {
        // 3. Fetch allowed_domains for this workspace in the same pass
        const { data: workspace, error: wsError } = await this.supabase
          .from('workspaces')
          .select('allowed_domains')
          .eq('id', candidate.workspace_id)
          .single();

        if (wsError) {
          this.logger.error(
            `Failed to fetch allowed_domains for workspace ${candidate.workspace_id}`,
            wsError,
          );
          // Fail open so a DB read error on settings doesn't take down the widget.
          // Do NOT cache — next request will retry the lookup.
          return { workspaceId: candidate.workspace_id, allowedDomains: [] };
        }

        const allowedDomains: string[] = (workspace?.allowed_domains as string[]) ?? [];

        // 4. Cache full result — guard needs no extra DB query per request
        this.validationCache.set(rawKey, {
          workspaceId:    candidate.workspace_id,
          allowedDomains,
          expiresAt:      Date.now() + CACHE_TTL_MS,
        });

        // Fire-and-forget: update last_used_at
        this.supabase
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', candidate.id)
          .then(() => {});

        return { workspaceId: candidate.workspace_id, allowedDomains };
      }
    }

    return null;
  }
}