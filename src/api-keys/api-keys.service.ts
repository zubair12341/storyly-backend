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
const KEY_PREFIX = 'swp_live_';

@Injectable()
export class ApiKeysService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(ApiKeysService.name);

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
    // 1. Generate a cryptographically random raw key
    const rawKey = KEY_PREFIX + crypto.randomBytes(32).toString('hex');

    // 2. First 12 chars used for fast DB lookup (prefix stored in plaintext)
    const keyPrefix = rawKey.substring(0, 12);

    // 3. Hash the full key for storage
    const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    // 4. Insert into database
    const { data, error } = await this.supabase
      .from('api_keys')
      .insert({
        workspace_id: workspaceId,
        name: dto.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
      })
      .select('id, name, key_prefix, is_active, created_at')
      .single();

    if (error) {
      this.logger.error('Failed to create API key', error);
      throw new InternalServerErrorException('Could not create API key.');
    }

    // 5. Return raw key ONCE — never stored, never retrievable again
    return {
      ...data,
      key: rawKey,
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
    // 1. Verify the key belongs to this workspace before deleting
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

    // Guard: prevent deleting another workspace's keys
    if (existing.workspace_id !== workspaceId) {
      throw new ForbiddenException('You do not have access to this API key.');
    }

    // 2. Delete
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
  //  Validate (used by Widget guard)
  // ─────────────────────────────────────────────

  async validate(rawKey: string): Promise<{ workspaceId: string } | null> {
    if (!rawKey?.startsWith(KEY_PREFIX)) return null;

    const keyPrefix = rawKey.substring(0, 12);

    // 1. Narrow candidates by prefix (fast index lookup)
    const { data: candidates, error } = await this.supabase
      .from('api_keys')
      .select('id, workspace_id, key_hash')
      .eq('key_prefix', keyPrefix)
      .eq('is_active', true);

    if (error || !candidates?.length) return null;

    // 2. bcrypt compare against each candidate (usually just one)
    for (const candidate of candidates) {
      const match = await bcrypt.compare(rawKey, candidate.key_hash);
      if (match) {
        // Fire-and-forget: update last_used_at
        this.supabase
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', candidate.id)
          .then(() => {});

        return { workspaceId: candidate.workspace_id };
      }
    }

    return null;
  }
}