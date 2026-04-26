import { CronExpression } from '@nestjs/schedule'
import type { RecurringInterval } from './stripe.service'

export type OfferTier = 'free' | 'starter' | 'writer' | 'pro'

export interface OfferConfig {
  id: string;
  tier: OfferTier;
  priceId?: string;
  name: string;
  description: string;
  price: string;
  amountCents?: number;
  currency?: string;
  interval: RecurringInterval;
  badge?: string;
  isActive: boolean;
  includes?: string[];
  maxBlocksAnalyzed?: number | 'unlimited'; // per project
  initialHoldPeriod?: number; // hours of use before scanning for threads
  scanCadence?: CronExpression; // how often to scan for threads
  processingMethod?: 'batch' | 'standard';
  autoAnalyze?: 'weekly' | false;
  blockRecoveryOn: 'next-scan';
  maxSimulations: number; // monthy reset
  cacheTTL: string;
  maxActiveProjects: number | 'unlimited';
  model: '4.1-nano' | '4o-mini'
}

export type SubscriptionStatus = string | null | undefined

export type TierPolicy = Pick<
  OfferConfig,
  'tier' | 'maxBlocksAnalyzed' | 'initialHoldPeriod' | 'scanCadence' | 'processingMethod' | 'autoAnalyze' | 'maxSimulations' | 'maxActiveProjects' | 'cacheTTL' | 'model'
>;

// free
const FREE_OFFER: OfferConfig = {
    id: 'free-plan',
  tier: 'free',
    name: 'Free Plan',
    description:
      'Get started with the free plan to explore the product with limited access.',
    price: '$0',
    amountCents: 0,
    currency: 'usd',
    interval: 'month',
    badge: 'Free',
    isActive: true,
    includes: [
      '1 project',
      '5 story simulations',
      'Unlimited characters, locations, and passages',
      'Storyboard that analyzes your manuscript'
    ],
    maxActiveProjects: 1,
    model: '4.1-nano',
    maxBlocksAnalyzed: 20,
    initialHoldPeriod: 48,
    scanCadence: CronExpression.EVERY_6_HOURS,
    processingMethod: 'batch',
    autoAnalyze: false,
    blockRecoveryOn: 'next-scan',
    maxSimulations: 5,
    cacheTTL: '10m'
}

const STARTER_MONTHLY: OfferConfig = {
    id: 'starter-monthly',
  tier: 'starter',
    name: 'Starter Plan',
    description: 'Perfect for individuals just getting started.',
    price: '$6',
    amountCents: 600,
    currency: 'usd',
    interval: 'month',
    badge: 'Starter',
    isActive: false,
    includes: [
      'Everything in Free Plan plus',
      '10 story simulations',
      'OpenAI Batch processing for lower-cost analysis'
    ],
    maxBlocksAnalyzed: 50,
    maxActiveProjects: 3,
    model: '4o-mini',
    initialHoldPeriod: 48,
    scanCadence: CronExpression.EVERY_3_HOURS,
    processingMethod: 'batch',
    autoAnalyze: 'weekly',
    blockRecoveryOn: 'next-scan',
    maxSimulations: 10,
    cacheTTL: '10m'

}

const WRITER_MONTHLY: OfferConfig = {
  id: 'writer-monthly',
  tier: 'writer',
  name: 'Writer Plan',
  description: 'For writers who need more advanced features and higher limits.',
  price: '$15',
  amountCents: 1500,
  currency: 'usd',
  interval: 'month',
  badge: 'Writer',
  isActive: false,
  includes: [
    'Everything in Starter Plan plus',
    '20 story simulations',
    'Weekly consistency re-analysis'
  ],
  maxBlocksAnalyzed: 200,
  maxActiveProjects: 5,
  model: '4o-mini',
  initialHoldPeriod: 48,
  scanCadence: CronExpression.EVERY_HOUR,
  processingMethod: 'batch',
  autoAnalyze: 'weekly',
  blockRecoveryOn: 'next-scan',
  maxSimulations: 20,
  cacheTTL: '1h'
}

const PRO_MONTHLY: OfferConfig = {
    id: 'pro-monthly',
  tier: 'pro',
    name: 'Pro Plan',
    description: 'For professionals who need the highest limits and advanced features.',
    price: '$25',
    amountCents: 2500,
    currency: 'usd',
    interval: 'month',
    badge: 'Pro',
    isActive: false,
    includes: [
      'Everything in Writer Plan plus',
      '50 story simulations',
      'Full-manuscript simulation context',
      'Priority support'
    ],
    maxActiveProjects: 'unlimited',
    model: '4o-mini',
    maxBlocksAnalyzed: 'unlimited',
    initialHoldPeriod: 24,
    scanCadence: CronExpression.EVERY_30_MINUTES,
    processingMethod: 'standard',
    autoAnalyze: 'weekly',
    blockRecoveryOn: 'next-scan',
    maxSimulations: 50,
    cacheTTL: '24h'

}

// Early Bird - temporary promotional offer
const EARLY_BIRD_MONTHLY: OfferConfig = Object.assign({}, STARTER_MONTHLY, {
    id: 'early-bird-monthly',
  tier: 'starter',
    name: 'Early Bird Special',
  description: 'Starter tier access at early bird monthly pricing.',
    price: '$10',
    amountCents: 1000,
    badge: 'Best Value',
    isActive: true,
})

const EARLY_BIRD_ANNUAL: OfferConfig = Object.assign({}, EARLY_BIRD_MONTHLY, {
    id: 'early-bird-annual',
  tier: 'starter',
    interval: 'year',
    price: '$100',
    amountCents: 10000,
    badge: 'Save 20%',
    isActive: true,
});


export const OFFERS: OfferConfig[] = [
  FREE_OFFER,
  EARLY_BIRD_MONTHLY,
  EARLY_BIRD_ANNUAL,
  STARTER_MONTHLY,
  WRITER_MONTHLY,
  PRO_MONTHLY
].filter((offer) => offer.isActive);

const ALL_OFFERS: OfferConfig[] = [
  FREE_OFFER,
  EARLY_BIRD_MONTHLY,
  EARLY_BIRD_ANNUAL,
  STARTER_MONTHLY,
  WRITER_MONTHLY,
  PRO_MONTHLY,
];

export const OFFER_BY_ID = new Map(OFFERS.map((offer) => [offer.id, offer]));
const ALL_OFFER_BY_ID = new Map(ALL_OFFERS.map((offer) => [offer.id, offer]));
const POLICY_BY_TIER = new Map<OfferTier, TierPolicy>([
  ['free', FREE_OFFER],
  ['starter', STARTER_MONTHLY],
  ['writer', WRITER_MONTHLY],
  ['pro', PRO_MONTHLY],
]);

export const DEFAULT_FREE_TIER: OfferTier = 'free';

export function getOfferById(offerId: string): OfferConfig | undefined {
  return ALL_OFFER_BY_ID.get(offerId) ?? OFFER_BY_ID.get(offerId);
}

export function getOfferTier(offerId: string | null | undefined): OfferTier {
  if (!offerId) return DEFAULT_FREE_TIER;
  return getOfferById(offerId)?.tier ?? DEFAULT_FREE_TIER;
}

export function getTierPolicy(tier: OfferTier): TierPolicy {
  return POLICY_BY_TIER.get(tier) ?? FREE_OFFER;
}

export function resolveTierFromSubscription(input: {
  subscriptionStatus: SubscriptionStatus;
  subscriptionOfferId?: string | null;
}): OfferTier {
  const offerTier = getOfferTier(input.subscriptionOfferId);
  if (input.subscriptionOfferId) {
    return offerTier;
  }

  // Transitional fallback while older subscriptions may not yet have offer IDs persisted.
  if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing') {
    return 'starter';
  }

  return DEFAULT_FREE_TIER;
}
