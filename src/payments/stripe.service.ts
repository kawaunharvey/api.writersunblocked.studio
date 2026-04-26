import { Injectable, Logger } from '@nestjs/common'
import Stripe from 'stripe'
import { AppConfigService } from '../common/config/app-config.service'
import { PrismaService } from '../database/prisma.service'

export type RecurringInterval = 'day' | 'week' | 'month' | 'year';

export interface CheckoutOfferPricing {
  id: string;
  tier?: string;
  name: string;
  description: string;
  interval: RecurringInterval;
  priceId?: string;
  amountCents?: number;
  currency?: string;
}

@Injectable()
export class StripeService {
  private readonly stripe: any;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.stripe = new Stripe(this.config.stripeSecretKey, {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  async createCustomer(email: string, name: string | null): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name: name ?? undefined,
    });
    return customer.id;
  }

  async createCheckoutSession(
    customerId: string,
    offer: CheckoutOfferPricing,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    const lineItem = offer.priceId
      ? { price: offer.priceId, quantity: 1 }
      : {
          price_data: {
            currency: offer.currency ?? 'usd',
            unit_amount: offer.amountCents ?? 0,
            recurring: { interval: offer.interval },
            product_data: {
              name: offer.name,
              description: offer.description,
            },
          },
          quantity: 1,
        };

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [lineItem],
      metadata: {
        offerId: offer.id,
        offerTier: offer.tier ?? 'free',
      },
      subscription_data: {
        metadata: {
          offerId: offer.id,
          offerTier: offer.tier ?? 'free',
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return session.url as string;
  }

  constructWebhookEvent(payload: Buffer, signature: string): any {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.config.stripeWebhookSecret,
    );
  }

  async handleSubscriptionUpdated(subscription: any) {
    const customerId = subscription.customer as string;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!user) {
      this.logger.warn(`No user found for Stripe customer ${customerId}`);
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: subscription.status,
        subscriptionOfferId:
          typeof subscription.metadata?.offerId === 'string' && subscription.metadata.offerId.trim().length > 0
            ? subscription.metadata.offerId.trim()
            : null,
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
      },
    });

    this.logger.log(`Subscription updated for user ${user.id}: ${subscription.status}`);

    // Handle referrer rewards: detect trialing → active transition
    const previousStatus = subscription.previous_attributes?.status;
    if (previousStatus === 'trialing' && subscription.status === 'active' && user.referredByWaitlistCode) {
      await this.handleReferrerReward(user);
    }
  }

  private async handleReferrerReward(referredUser: any) {
    try {
      const referralCode = referredUser.referredByWaitlistCode;

      // Find the Waitlist entry
      const waitlistEntry = await this.prisma.waitlist.findUnique({
        where: { referralCode },
      });

      if (!waitlistEntry) {
        this.logger.warn(`Referral code ${referralCode} not found for reward`);
        return;
      }

      // Find the referrer User
      const referrerUser = await this.prisma.user.findUnique({
        where: { email: waitlistEntry.email },
      });

      if (!referrerUser || !referrerUser.stripeCustomerId) {
        this.logger.warn(`Referrer user not found or has no Stripe customer for referral code ${referralCode}`);
        return;
      }

      // Increment paidReferralsCount on the Waitlist entry
      const updatedWaitlistEntry = await this.prisma.waitlist.update({
        where: { id: waitlistEntry.id },
        data: { paidReferralsCount: { increment: 1 } },
      });

      this.logger.log(
        `Incremented paid referrals for ${referralCode}: ${updatedWaitlistEntry.paidReferralsCount}`,
      );

      // Check if referrer should receive reward (every 3 paid conversions)
      if (updatedWaitlistEntry.paidReferralsCount % 3 === 0) {
        // Apply 1 month of Starter credit ($6) to referrer's Stripe account
        const creditAmountCents = 600; // $6 in cents
        await this.stripe.customers.createBalanceTransaction(referrerUser.stripeCustomerId, {
          amount: -creditAmountCents, // Negative = credit
          currency: 'usd',
          description: `Referral reward: ${updatedWaitlistEntry.paidReferralsCount / 3} user(s) subscribed`,
        });

        this.logger.log(
          `Applied $6 credit to referrer ${referrerUser.id} (referral reward #${updatedWaitlistEntry.paidReferralsCount / 3})`,
        );
      }
    } catch (error) {
      this.logger.error(`Error handling referrer reward: ${error}`, error);
    }
  }

  async handleSubscriptionDeleted(subscription: any) {
    const customerId = subscription.customer as string;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!user) return;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionOfferId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    });
  }
}
