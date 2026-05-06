import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import StripeSDK = require('stripe');
import { PLANS, STRIPE_PRICE_IDS, PlanId } from './plans.config';

// ── Stripe types derived from the instance (avoids broken namespace access in v22) ──
type StripeInstance        = StripeSDK.Stripe;
type StripeEvent           = Awaited<ReturnType<StripeInstance['events']['retrieve']>>;
type StripeSubscription    = Awaited<ReturnType<StripeInstance['subscriptions']['retrieve']>>;
type StripeInvoice         = Awaited<ReturnType<StripeInstance['invoices']['retrieve']>>;
type StripeCheckoutSession = Awaited<ReturnType<StripeInstance['checkout']['sessions']['retrieve']>>;

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

  async createCheckoutSession(workspaceId: string, plan: 'pro' | 'business') {
    const priceId = Object.entries(STRIPE_PRICE_IDS).find(([, p]) => p === plan)?.[0];
    if (!priceId || priceId.startsWith('__unset')) {
      throw new BadRequestException(`No Stripe price configured for plan: ${plan}`);
    }

    const customerId = await this.getOrCreateCustomer(workspaceId);
    const successUrl = this.configService.getOrThrow('STRIPE_SUCCESS_URL');
    const cancelUrl  = this.configService.getOrThrow('STRIPE_CANCEL_URL');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { workspace_id: workspaceId },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    }); 

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string) {
    const secret = this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET');

    let event: StripeEvent;
    try {
      this.logger.debug(`WEBHOOK SECRET: ${this.configService.get('STRIPE_WEBHOOK_SECRET')}`);
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret) as StripeEvent;
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature.');
    }

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

    return { received: true };
  }

  async checkStoryLimit(workspaceId: string): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId);
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

    if ((count ?? 0) >= limits.maxStories) {
      throw new ForbiddenException('Plan limit reached');
    }
  }

  async checkViewLimit(workspaceId: string): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId);
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

    if ((count ?? 0) >= limits.maxMonthlyViews) {
      throw new ForbiddenException('Plan limit reached');
    }
  }

  async getStatus(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('plan, subscription_status')
      .eq('id', workspaceId)
      .single();

    if (error) throw new InternalServerErrorException('Could not fetch billing status.');

    const plan: PlanId = (data.plan as PlanId) ?? 'free';
    return {
      plan,
      subscription_status: data.subscription_status ?? null,
      limits: PLANS[plan],
    };
  }

  private async onCheckoutCompleted(session: StripeCheckoutSession) {
    const workspaceId = session.metadata?.workspace_id;
    console.log('SESSION METADATA:', session.metadata);
    if (!workspaceId) {
      this.logger.warn('checkout.session.completed missing workspace_id metadata');
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string,
    );

    const priceId = subscription.items.data[0]?.price?.id;
    const plan: PlanId = STRIPE_PRICE_IDS[priceId ?? ''] ?? 'pro';

    await this.upsertWorkspaceBilling(workspaceId, {
      plan,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: subscription.id,
      subscription_status: 'active',
    });
  }

  private async onSubscriptionUpdated(subscription: StripeSubscription) {
    const workspaceId = await this.findWorkspaceBySubscription(subscription.id);
    if (!workspaceId) return;

    const priceId = subscription.items.data[0]?.price?.id;
    const mappedPlan: PlanId = STRIPE_PRICE_IDS[priceId ?? ''] ?? 'pro';
    const isActive = ['active', 'trialing'].includes(subscription.status);

    await this.upsertWorkspaceBilling(workspaceId, {
      plan: isActive ? mappedPlan : 'free',
      subscription_status: subscription.status,
    });
  }

  private async onSubscriptionDeleted(subscription: StripeSubscription) {
    const workspaceId = await this.findWorkspaceBySubscription(subscription.id);
    if (!workspaceId) return;

    await this.upsertWorkspaceBilling(workspaceId, {
      plan: 'free',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
    });
  }

  private async onPaymentFailed(invoice: StripeInvoice) {
    // In Stripe v22, subscription moved to invoice.parent.subscription_details.subscription
    const rawSub = (invoice as any).parent?.subscription_details?.subscription
      ?? (invoice as any).subscription;
    const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id;
    if (!subscriptionId) return;

    const workspaceId = await this.findWorkspaceBySubscription(subscriptionId);
    if (!workspaceId) return;

    await this.upsertWorkspaceBilling(workspaceId, { subscription_status: 'past_due' });
  }

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
      name: data?.name ?? undefined,
    });

    await this.supabase
      .from('workspaces')
      .update({ stripe_customer_id: customer.id })
      .eq('id', workspaceId);

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
    }
  }
}