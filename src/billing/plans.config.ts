export type PlanId = 'free' | 'pro' | 'business';

export interface PlanLimits {
  maxStories: number;
  maxMonthlyViews: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxStories: 5,
    maxMonthlyViews: 1_000,
  },
  pro: {
    maxStories: 50,
    maxMonthlyViews: 50_000,
  },
  business: {
    maxStories: Infinity,
    maxMonthlyViews: Infinity,
  },
};

/**
 * Map Stripe Price IDs → plan.
 * Set in .env:
 *   STRIPE_PRICE_PRO=price_xxx
 *   STRIPE_PRICE_BUSINESS=price_yyy
 */
export const STRIPE_PRICE_IDS: Partial<Record<string, PlanId>> = {
  [process.env.STRIPE_PRICE_PRO      ?? '__unset_pro__']:      'pro',
  [process.env.STRIPE_PRICE_BUSINESS ?? '__unset_business__']: 'business',
};
