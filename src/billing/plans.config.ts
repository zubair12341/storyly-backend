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

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORTANT: STRIPE_PRICE_IDS has been intentionally removed from this file.
//
//  The old implementation read process.env.STRIPE_PRICE_PRO and
//  process.env.STRIPE_PRICE_BUSINESS at MODULE LOAD TIME (when this file was
//  first imported). On Render (and other PaaS hosts) environment variables may
//  not be fully injected before NestJS module initialisation completes, which
//  caused the keys to resolve as '__unset_pro__' / '__unset_business__'.
//
//  Price ID lookup is now handled exclusively inside BillingService via
//  ConfigService (getPriceId / mapPriceIdToPlan), which reads from the
//  injected config at the time each method is called — guaranteed to be after
//  full bootstrap.
//
//  Required Render / production env vars:
//    STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxx
//    STRIPE_PRICE_BUSINESS=price_yyyyyyyyyyyyyyyy
// ─────────────────────────────────────────────────────────────────────────────