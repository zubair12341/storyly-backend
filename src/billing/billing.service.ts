import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import StripeSDK = require('stripe');
import { PLANS, PlanId } from './plans.config';
import { PlanLimitExceededException } from './exceptions/plan-limit-exceeded.exception';

// ── Stripe types derived from the instance (avoids broken namespace access in v22) ──
type StripeInstance        = StripeSDK.Stripe;
type StripeEvent           = Awaited<ReturnType<StripeInstance['events']['retrieve']>>;
type StripeSubscription    = Awaited<ReturnType<StripeInstance['subscriptions']['retrieve']>>;
type StripeInvoice         = Awaited<ReturnType<StripeInstance['invoices']['retrieve']>>;
type StripeCheckoutSession = Awaited<ReturnType<StripeInstance['checkout']['sessions']['retrieve']>>;

// Event types that must be deduplicated via processed_stripe_events table.
const IDEMPOTENT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

@Injectable()
export class BillingService {
  private readonly supabase: SupabaseClient;
  private readonly stripe: StripeInstance;
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    );

    this.stripe = new StripeSDK(
      this.configService.getOrThrow('STRIPE_SECRET_KEY'),
      { apiVersion: '2026-04-22.dahlia' },
    );
  }

  // ─────────────────────────────────────────────
  //  Price ID helpers (runtime — uses ConfigService, not process.env at module load)
  // ─────────────────────────────────────────────

  private getPriceId(plan: 'pro' | 'business'): string {
    const envKey  = plan === 'pro' ? 'STRIPE_PRICE_PRO' : 'STRIPE_PRICE_BUSINESS';
    const priceId = this.configService.get<string>(envKey);
    if (!priceId || priceId.startsWith('__unset')) {
      throw new BadRequestException(`No Stripe price configured for plan: ${plan}`);
    }
    return priceId;
  }

  private mapPriceIdToPlan(priceId: string): PlanId {
    const proPriceId      = this.configService.get<string>('STRIPE_PRICE_PRO');
    const businessPriceId = this.configService.get<string>('STRIPE_PRICE_BUSINESS');

    if (priceId === businessPriceId) return 'business';
    if (priceId === proPriceId)      return 'pro';

    this.logger.warn(`Unrecognised Stripe price ID: ${priceId} — defaulting to 'pro'`);
    return 'pro';
  }

  // ─────────────────────────────────────────────
  //  Checkout session
  // ─────────────────────────────────────────────

  async createCheckoutSession(workspaceId: string, plan: 'pro' | 'business') {
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required to create a checkout session.');
    }

    const priceId    = this.getPriceId(plan);
    const customerId = await this.getOrCreateCustomer(workspaceId);
    const successUrl = this.configService.getOrThrow('STRIPE_SUCCESS_URL');
    const cancelUrl  = this.configService.getOrThrow('STRIPE_CANCEL_URL');

    const session = await this.stripe.checkout.sessions.create({
      mode:        'subscription',
      customer:    customerId,
      line_items:  [{ price: priceId, quantity: 1 }],
      metadata:    { workspace_id: workspaceId },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });

    this.logger.log(
      `Checkout session ${session.id} created for workspace ${workspaceId} (plan: ${plan})`,
    );

    return { url: session.url };
  }

  // ─────────────────────────────────────────────
  //  Customer portal
  // ─────────────────────────────────────────────

  async createPortalSession(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', workspaceId)
      .single();

    if (error || !data?.stripe_customer_id) {
      throw new BadRequestException(
        'No billing account found for this workspace. Complete a subscription first.',
      );
    }

    const returnUrl = this.configService.getOrThrow('STRIPE_SUCCESS_URL');

    const session = await this.stripe.billingPortal.sessions.create({
      customer:   data.stripe_customer_id,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  // ─────────────────────────────────────────────
  //  Webhook
  // ─────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | string, signature: string) {
    const secret = this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET');

    let event: StripeEvent;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret) as StripeEvent;
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature.');
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    // ── Idempotency check — only for actionable event types ──────────────────
    if (IDEMPOTENT_EVENT_TYPES.has(event.type)) {
      const alreadyProcessed = await this.isEventProcessed(event.id);
      if (alreadyProcessed) {
        this.logger.log(`Duplicate webhook skipped: ${event.id} (${event.type})`);
        return { received: true };
      }
    }

    // ── Dispatch ─────────────────────────────────────────────────────────────
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as StripeCheckoutSession);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as StripeSubscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as StripeSubscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as StripeInvoice);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    // ── Mark as processed AFTER successful handling ───────────────────────────
    // Inserting after (not before) means a crash during processing won't
    // permanently skip the event on the next Stripe retry.
    if (IDEMPOTENT_EVENT_TYPES.has(event.type)) {
      await this.markEventProcessed(event.id);
    }

    return { received: true };
  }

  // ─────────────────────────────────────────────
  //  Plan limit guards (used by PlanGuard)
  // ─────────────────────────────────────────────

  async checkStoryLimit(workspaceId: string): Promise<void> {
    const plan   = await this.getWorkspacePlan(workspaceId);
    const limits = PLANS[plan];
    if (limits.maxStories === Infinity) return;

    const { count, error } = await this.supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    if (error) {
      this.logger.error('Failed to count stories', error);
      throw new InternalServerErrorException('Could not verify plan limits.');
    }

    const current = count ?? 0;
    if (current >= limits.maxStories) {
      throw new PlanLimitExceededException({
        limit_type: 'stories',
        current,
        limit: limits.maxStories,
        plan,
      });
    }
  }

  async checkViewLimit(workspaceId: string): Promise<void> {
    const plan   = await this.getWorkspacePlan(workspaceId);
    const limits = PLANS[plan];
    if (limits.maxMonthlyViews === Infinity) return;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count, error } = await this.supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'story_view')
      .gte('created_at', startOfMonth.toISOString());

    if (error) {
      this.logger.error('Failed to count monthly views', error);
      throw new InternalServerErrorException('Could not verify plan limits.');
    }

    const current = count ?? 0;
    if (current >= limits.maxMonthlyViews) {
      throw new PlanLimitExceededException({
        limit_type: 'views',
        current,
        limit: limits.maxMonthlyViews,
        plan,
      });
    }
  }

  // ─────────────────────────────────────────────
  //  Billing status
  // ─────────────────────────────────────────────

  async getStatus(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('plan, subscription_status, stripe_subscription_id')
      .eq('id', workspaceId)
      .single();

    if (error) throw new InternalServerErrorException('Could not fetch billing status.');

    const plan: PlanId = (data.plan as PlanId) ?? 'free';
    return {
      plan,
      subscription_status:    data.subscription_status    ?? null,
      stripe_subscription_id: data.stripe_subscription_id ?? null,
      limits: PLANS[plan],
    };
  }

  // ─────────────────────────────────────────────
  //  Private webhook handlers
  // ─────────────────────────────────────────────

  private async onCheckoutCompleted(session: StripeCheckoutSession) {
    const workspaceId = session.metadata?.workspace_id;

    this.logger.log(`checkout.session.completed — session.id: ${session.id}`);
    this.logger.log(`SESSION METADATA: ${JSON.stringify(session.metadata)}`);

    if (!workspaceId) {
      this.logger.warn(
        'checkout.session.completed received but workspace_id is missing from metadata. ' +
        'This usually means workspaceId was undefined when the session was created (stale JWT). ' +
        'The user must log out and log in again before upgrading.',
      );
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string,
    );

    const priceId      = subscription.items.data[0]?.price?.id;
    const plan: PlanId = priceId ? this.mapPriceIdToPlan(priceId) : 'pro';

    await this.upsertWorkspaceBilling(workspaceId, {
      plan,
      stripe_customer_id:     session.customer as string,
      stripe_subscription_id: subscription.id,
      subscription_status:    'active',
    });

    this.logger.log(
      `Workspace ${workspaceId} upgraded to plan '${plan}' via subscription ${subscription.id}`,
    );
  }

  private async onSubscriptionUpdated(subscription: StripeSubscription) {
    const workspaceId = await this.findWorkspaceBySubscription(subscription.id);
    if (!workspaceId) return;

    const priceId    = subscription.items.data[0]?.price?.id;
    const mappedPlan = priceId ? this.mapPriceIdToPlan(priceId) : 'pro';
    const isActive   = ['active', 'trialing'].includes(subscription.status);

    await this.upsertWorkspaceBilling(workspaceId, {
      plan:                isActive ? mappedPlan : 'free',
      subscription_status: subscription.status,
    });
  }

  private async onSubscriptionDeleted(subscription: StripeSubscription) {
    const workspaceId = await this.findWorkspaceBySubscription(subscription.id);
    if (!workspaceId) return;

    await this.upsertWorkspaceBilling(workspaceId, {
      plan:                   'free',
      subscription_status:    'canceled',
      stripe_subscription_id: null,
    });
  }

  private async onPaymentFailed(invoice: StripeInvoice) {
    const rawSub = (invoice as any).parent?.subscription_details?.subscription
      ?? (invoice as any).subscription;
    const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id;
    if (!subscriptionId) return;

    const workspaceId = await this.findWorkspaceBySubscription(subscriptionId);
    if (!workspaceId) return;

    await this.upsertWorkspaceBilling(workspaceId, { subscription_status: 'past_due' });
  }

  // ─────────────────────────────────────────────
  //  Idempotency helpers
  // ─────────────────────────────────────────────

  private async isEventProcessed(stripeEventId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('processed_stripe_events')
      .select('stripe_event_id')
      .eq('stripe_event_id', stripeEventId)
      .maybeSingle();

    if (error) {
      this.logger.error('Failed to check processed_stripe_events', error);
      // On DB error, allow processing to continue rather than silently skipping.
      return false;
    }

    return data !== null;
  }

  private async markEventProcessed(stripeEventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('processed_stripe_events')
      .insert({ stripe_event_id: stripeEventId });

    if (error) {
      // Non-fatal: log but don't throw — the event was already processed successfully.
      // A duplicate insert (race on concurrent retries) will fail with a PK violation,
      // which is also acceptable here.
      this.logger.error('Failed to record processed_stripe_events entry', error);
    }
  }

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  private async getWorkspacePlan(workspaceId: string): Promise<PlanId> {
    const { data } = await this.supabase
      .from('workspaces')
      .select('plan')
      .eq('id', workspaceId)
      .maybeSingle();

    return (data?.plan as PlanId) ?? 'free';
  }

  private async getOrCreateCustomer(workspaceId: string): Promise<string> {
    const { data } = await this.supabase
      .from('workspaces')
      .select('stripe_customer_id, name')
      .eq('id', workspaceId)
      .single();

    if (data?.stripe_customer_id) return data.stripe_customer_id;

    const customer = await this.stripe.customers.create({
      metadata: { workspace_id: workspaceId },
      name:     data?.name ?? undefined,
    });

    await this.supabase
      .from('workspaces')
      .update({ stripe_customer_id: customer.id })
      .eq('id', workspaceId);

    this.logger.log(`Created Stripe customer ${customer.id} for workspace ${workspaceId}`);

    return customer.id;
  }

  private async findWorkspaceBySubscription(subscriptionId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('workspaces')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (!data) {
      this.logger.warn(`No workspace found for subscription ${subscriptionId}`);
      return null;
    }

    return data.id;
  }

  private async upsertWorkspaceBilling(
    workspaceId: string,
    fields: {
      plan?: PlanId;
      stripe_customer_id?: string;
      stripe_subscription_id?: string | null;
      subscription_status?: string;
    },
  ) {
    const { error } = await this.supabase
      .from('workspaces')
      .update(fields)
      .eq('id', workspaceId);

    if (error) {
      this.logger.error('Failed to update workspace billing fields', error);
      throw new InternalServerErrorException('Failed to update billing status.');
    }
  }
}