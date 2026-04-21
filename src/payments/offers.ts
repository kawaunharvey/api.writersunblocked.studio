import { CronExpression } from '@nestjs/schedule'
import type { RecurringInterval } from './stripe.service'

export interface OfferConfig {
  id: string;
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

// free
const FREE_OFFER: OfferConfig = {
    id: 'free-plan',
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
      '3 story simulations',
      'Unlimited references',
      'Storyboard that analyzes your manuscript'
    ],
    maxActiveProjects: 1,
    model: '4.1-nano',
    maxBlocksAnalyzed: 20,
    scanCadence: CronExpression.EVERY_6_HOURS,
    processingMethod: 'batch',
    autoAnalyze: false,
    blockRecoveryOn: 'next-scan',
    maxSimulations: 5,
    cacheTTL: '10m'
}

const STARTER_MONTHLY: OfferConfig = {
    id: 'starter-monthly',
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
      'Deeper analysis on characters, world, and storylines'
    ],
    maxBlocksAnalyzed: 50,
    maxActiveProjects: 3,
    model: '4o-mini',
    initialHoldPeriod: 24,
    scanCadence: CronExpression.EVERY_3_HOURS,
    processingMethod: 'batch',
    autoAnalyze: false,
    blockRecoveryOn: 'next-scan',
    maxSimulations: 10,
    cacheTTL: '10m'

}

const WRITER_MONTHLY: OfferConfig = {
  id: 'writer-monthly',
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
    '50 story simulations',
    'Advanced analysis on characters, world, and storylines'
  ],
  maxBlocksAnalyzed: 200,
  maxActiveProjects: 5,
  model: '4o-mini',
  initialHoldPeriod: 24,
  scanCadence: CronExpression.EVERY_HOUR,
  processingMethod: 'batch',
  autoAnalyze: 'weekly',
  blockRecoveryOn: 'next-scan',
  maxSimulations: 20,
  cacheTTL: '1h'
}

const PRO_MONTHLY: OfferConfig = {
    id: 'pro-monthly',
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
      'Unlimited story simulations',
      'Priority support'
    ],
    maxActiveProjects: 'unlimited',
    model: '4o-mini', // todo get the actual model name from chatgpt,
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
    name: 'Early Bird Special',
    description: 'Lock in early bird pricing before it goes up.',
    price: '$10',
    amountCents: 1000,
    badge: 'Best Value',
    isActive: true,
})

const EARLY_BIRD_ANNUAL: OfferConfig = Object.assign({}, EARLY_BIRD_MONTHLY, {
    id: 'early-bird-annual',
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
