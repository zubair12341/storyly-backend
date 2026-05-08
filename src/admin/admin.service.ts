import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AdminStats {
  total_workspaces: number;
  total_users: number;
  plans: { free: number; pro: number; business: number };
  total_stories: number;
  total_events_this_month: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  plan: string;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  allowed_domains: string[];
  story_count: number;
  owner_email: string;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  api_keys_count: number;
}

export interface UserSummary {
  id: string;
  email: string;
  role: string;
  created_at: string;
  workspace_id: string;
  plan: string;
}

@Injectable()
export class AdminService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  // ─────────────────────────────────────────────
  //  GET /admin/stats
  // ─────────────────────────────────────────────

  async getStats(): Promise<AdminStats> {
    const [
      { count: total_workspaces, error: wsErr },
      { count: total_users, error: usersErr },
      { data: planRows, error: planErr },
      { count: total_stories, error: storiesErr },
      { count: total_events_this_month, error: eventsErr },
    ] = await Promise.all([
      this.supabase
        .from('workspaces')
        .select('id', { count: 'exact', head: true }),
      this.supabase
        .from('users')
        .select('id', { count: 'exact', head: true }),
      this.supabase.from('workspaces').select('plan'),
      this.supabase
        .from('stories')
        .select('id', { count: 'exact', head: true }),
      this.supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte(
          'created_at',
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
        ),
    ]);

    if (wsErr) this.logger.error('getStats: workspaces count error', wsErr);
    if (usersErr) this.logger.error('getStats: users count error', usersErr);
    if (planErr) this.logger.error('getStats: plans error', planErr);
    if (storiesErr) this.logger.error('getStats: stories count error', storiesErr);
    if (eventsErr) this.logger.error('getStats: events count error', eventsErr);

    const plans = { free: 0, pro: 0, business: 0 };
    if (planRows) {
      for (const row of planRows as Array<{ plan: string }>) {
        const p = row.plan as keyof typeof plans;
        if (p in plans) plans[p]++;
      }
    }

    return {
      total_workspaces: total_workspaces ?? 0,
      total_users: total_users ?? 0,
      plans,
      total_stories: total_stories ?? 0,
      total_events_this_month: total_events_this_month ?? 0,
    };
  }

  // ─────────────────────────────────────────────
  //  GET /admin/workspaces
  // ─────────────────────────────────────────────

  async getWorkspaces(
    page: number,
    limit: number,
  ): Promise<{ data: WorkspaceSummary[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: workspaces, error, count } = await this.supabase
      .from('workspaces')
      .select(
        'id, name, plan, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, allowed_domains',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger.error('getWorkspaces error', error);
      throw new InternalServerErrorException('Failed to fetch workspaces.');
    }

    if (!workspaces || workspaces.length === 0) {
      return { data: [], total: count ?? 0 };
    }

    const workspaceIds = workspaces.map((w) => w.id);

    // Fetch story counts per workspace
    const { data: storyCounts, error: scErr } = await this.supabase
      .from('stories')
      .select('workspace_id')
      .in('workspace_id', workspaceIds);

    if (scErr) this.logger.error('getWorkspaces: story counts error', scErr);

    const storyCountMap: Record<string, number> = {};
    for (const s of storyCounts ?? []) {
      storyCountMap[s.workspace_id] = (storyCountMap[s.workspace_id] ?? 0) + 1;
    }

    // Fetch owner emails (first user per workspace)
    const { data: ownerRows, error: ownerErr } = await this.supabase
      .from('users')
      .select('workspace_id, email')
      .in('workspace_id', workspaceIds);

    if (ownerErr) this.logger.error('getWorkspaces: owner emails error', ownerErr);

    const ownerMap: Record<string, string> = {};
    for (const u of ownerRows ?? []) {
      if (!ownerMap[u.workspace_id]) {
        ownerMap[u.workspace_id] = u.email;
      }
    }

    const data: WorkspaceSummary[] = workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      plan: w.plan,
      subscription_status: w.subscription_status ?? null,
      stripe_customer_id: w.stripe_customer_id ?? null,
      stripe_subscription_id: w.stripe_subscription_id ?? null,
      created_at: w.created_at,
      allowed_domains: w.allowed_domains ?? [],
      story_count: storyCountMap[w.id] ?? 0,
      owner_email: ownerMap[w.id] ?? '',
    }));

    return { data, total: count ?? 0 };
  }

  // ─────────────────────────────────────────────
  //  GET /admin/workspaces/:id
  // ─────────────────────────────────────────────

  async getWorkspaceById(id: string): Promise<WorkspaceDetail> {
    const { data: workspace, error } = await this.supabase
      .from('workspaces')
      .select(
        'id, name, plan, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, allowed_domains',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`getWorkspaceById(${id}) error`, error);
      throw new InternalServerErrorException('Failed to fetch workspace.');
    }
    if (!workspace) throw new NotFoundException('Workspace not found.');

    const [
      { data: stories, error: scErr },
      { data: ownerRows, error: ownerErr },
      { data: apiKeys, error: akErr },
    ] = await Promise.all([
      this.supabase
        .from('stories')
        .select('id')
        .eq('workspace_id', id),
      this.supabase
        .from('users')
        .select('email')
        .eq('workspace_id', id)
        .limit(1),
      this.supabase
        .from('api_keys')
        .select('id')
        .eq('workspace_id', id),
    ]);

    if (scErr) this.logger.error(`getWorkspaceById(${id}): stories error`, scErr);
    if (ownerErr) this.logger.error(`getWorkspaceById(${id}): owner error`, ownerErr);
    if (akErr) this.logger.error(`getWorkspaceById(${id}): api_keys error`, akErr);

    return {
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      subscription_status: workspace.subscription_status ?? null,
      stripe_customer_id: workspace.stripe_customer_id ?? null,
      stripe_subscription_id: workspace.stripe_subscription_id ?? null,
      created_at: workspace.created_at,
      allowed_domains: workspace.allowed_domains ?? [],
      story_count: stories?.length ?? 0,
      owner_email: ownerRows?.[0]?.email ?? '',
      api_keys_count: apiKeys?.length ?? 0,
    };
  }

  // ─────────────────────────────────────────────
  //  POST /admin/workspaces/:id/override-plan
  // ─────────────────────────────────────────────

  async overridePlan(
    workspaceId: string,
    plan: 'free' | 'pro' | 'business',
    adminUserId: string,
  ): Promise<{ success: boolean }> {
    const subscriptionStatus =
      plan === 'free' ? null : 'active';

    const { error } = await this.supabase
      .from('workspaces')
      .update({ plan, subscription_status: subscriptionStatus })
      .eq('id', workspaceId);

    if (error) {
      this.logger.error(`overridePlan(${workspaceId}) error`, error);
      throw new InternalServerErrorException('Failed to override plan.');
    }

    this.logger.warn(
      `[ADMIN] User ${adminUserId} overrode plan for workspace ${workspaceId} → ${plan}`,
    );

    return { success: true };
  }

  // ─────────────────────────────────────────────
  //  GET /admin/users
  // ─────────────────────────────────────────────

  async getUsers(
    page: number,
    limit: number,
  ): Promise<{ data: UserSummary[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: users, error, count } = await this.supabase
      .from('users')
      .select('id, email, role, created_at, workspace_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger.error('getUsers error', error);
      throw new InternalServerErrorException('Failed to fetch users.');
    }

    if (!users || users.length === 0) {
      return { data: [], total: count ?? 0 };
    }

    const workspaceIds = [...new Set(users.map((u) => u.workspace_id).filter(Boolean))];

    const { data: workspaces, error: wsErr } = await this.supabase
      .from('workspaces')
      .select('id, plan')
      .in('id', workspaceIds);

    if (wsErr) this.logger.error('getUsers: workspaces error', wsErr);

    const planMap: Record<string, string> = {};
    for (const w of workspaces ?? []) {
      planMap[w.id] = w.plan;
    }

    const data: UserSummary[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
      workspace_id: u.workspace_id,
      plan: planMap[u.workspace_id] ?? 'free',
    }));

    return { data, total: count ?? 0 };
  }

  // ─────────────────────────────────────────────
  //  POST /admin/users/:id/set-role
  // ─────────────────────────────────────────────

  async setUserRole(
    targetUserId: string,
    role: 'user' | 'admin',
    adminUserId: string,
  ): Promise<{ success: boolean }> {
    if (targetUserId === adminUserId) {
      throw new BadRequestException('You cannot change your own role.');
    }

    const { error } = await this.supabase
      .from('users')
      .update({ role })
      .eq('id', targetUserId);

    if (error) {
      this.logger.error(`setUserRole(${targetUserId}) error`, error);
      throw new InternalServerErrorException('Failed to update user role.');
    }

    return { success: true };
  }
}
