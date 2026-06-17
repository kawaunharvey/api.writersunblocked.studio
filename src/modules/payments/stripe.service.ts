import { AppConfigService } from '@/common/config/app-config.service'
import { PrismaService } from '@/database/prisma.service'
import { Injectable, Logger } from '@nestjs/common'
import type { PaidSubscriptionTier, SubscriptionStatus } from '@prisma/client'
import Stripe from 'stripe'
import { getOfferById } from './offers'

export type RecurringInterval = 'day' | 'week' | 'month' | 'year'

export interface CheckoutOfferPricing {
  id: string
  tier?: string
  name: string
  description: string
  interval: RecurringInterval
  priceId?: string
  amountCents?: number
  currency?: string
}

@Injectable()
export class StripeService {
  private readonly stripe: any
  private readonly logger = new Logger(StripeService.name)

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.stripe = new Stripe(this.config.stripeSecretKey, {
      apiVersion: '2026-03-25.dahlia',
    })
  }

  async createCustomer(email: string, name: string | null): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name: name ?? undefined,
    })
    return customer.id
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
        }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [lineItem],
      metadata: {
        offerId: offer.id,
        offerTier: offer.tier ?? 'starter',
      },
      subscription_data: {
        metadata: {
          offerId: offer.id,
          offerTier: offer.tier ?? 'starter',
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })
    return session.url as string
  }

  constructWebhookEvent(payload: Buffer, signature: string): any {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.config.stripeWebhookSecret,
    )
  }

  async handleSubscriptionUpdated(subscription: any) {
    console.log('Handling subscription update:', subscription)
    const customerId = subscription.customer as string
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    })
    if (!user) {
      this.logger.warn(`No user found for Stripe customer ${customerId}`)
      return
    }

    const offer = getOfferById(subscription.metadata?.offerId)

    if (!offer) {
      this.logger.warn(
        `No offer config found for offer ID ${subscription.metadata?.offerId}`,
      )
      return
    }

    const existingSubscription = await this.prisma.userSubscription.findUnique({
      where: { userId: user.id },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        expiresAt: true,
      },
    })

    const currentPeriodEndUnix = (subscription as { current_period_end?: number })
      .current_period_end
    const expiresAt = currentPeriodEndUnix
      ? new Date(currentPeriodEndUnix * 1000)
      : existingSubscription?.expiresAt ?? new Date()
    const normalizedStatus =
      (subscription.status as SubscriptionStatus) ?? 'active'
    const previousStatus = existingSubscription?.subscriptionStatus ?? null

    await this.prisma.userSubscription.upsert({
      where: { userId: user.id },
      create: {
        user: {
          connect: { id: user.id },
        },
        tier: offer?.tier as PaidSubscriptionTier,
        subscriptionStatus: normalizedStatus,
        trialEndsAt: existingSubscription?.trialEndsAt ?? null,
        expiresAt,
        stripeCustomerId: customerId,
        metadata: {
          offerId: offer.id,
          stripeSubscriptionId: subscription.id,
        },
      },
      update: {
        subscriptionStatus: normalizedStatus,
        stripeCustomerId: customerId,
        tier: offer?.tier as PaidSubscriptionTier,
        expiresAt,
        metadata: {
          offerId: offer.id,
          stripeSubscriptionId: subscription.id,
        },
      },
    })

    this.logger.log(
      `Subscription updated for user ${user.id}: ${normalizedStatus}`,
    )

    // Handle referrer rewards: detect trialing → active transition
    if (
      previousStatus === 'trialing' &&
      normalizedStatus === 'active' &&
      user.referredByReferralId
    ) {
      await this.handleReferrerReward(user)
    }
  }

  private async handleReferrerReward(referredUser: any) {
    try {
      // Find the referrer's Referral record via the direct FK
      const referral = await this.prisma.referral.findUnique({
        where: { id: referredUser.referredByReferralId },
      })

      if (!referral) {
        this.logger.warn(
          `Referral record ${referredUser.referredByReferralId} not found for reward`,
        )
        return
      }

      // Find the referrer User
      const referrerUser = await this.prisma.user.findUnique({
        where: { id: referral.userId },
      })

      if (!referrerUser || !referrerUser.stripeCustomerId) {
        this.logger.warn(
          `Referrer user ${referral.userId} not found or has no Stripe customer`,
        )
        return
      }

      // Increment paidReferralsCount on the Referral record
      const updatedReferral = await this.prisma.referral.update({
        where: { id: referral.id },
        data: { paidReferralsCount: { increment: 1 } },
      })

      this.logger.log(
        `Incremented paid referrals for referral ${referral.id}: ${updatedReferral.paidReferralsCount}`,
      )

      // Check if referrer should receive reward (every 3 paid conversions)
      if (updatedReferral.paidReferralsCount % 3 === 0) {
        // Apply 1 month of Starter credit ($6) to referrer's Stripe account
        const creditAmountCents = 600 // $6 in cents
        await this.stripe.customers.createBalanceTransaction(
          referrerUser.stripeCustomerId,
          {
            amount: -creditAmountCents, // Negative = credit
            currency: 'usd',
            description: `Referral reward: ${updatedReferral.paidReferralsCount / 3} user(s) subscribed`,
          },
        )

        this.logger.log(
          `Applied $6 credit to referrer ${referrerUser.id} (referral reward #${updatedReferral.paidReferralsCount / 3})`,
        )
      }
    } catch (error) {
      this.logger.error(`Error handling referrer reward: ${error}`, error)
    }
  }

  async handleSubscriptionDeleted(subscription: any) {
    const customerId = subscription.customer as string
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
    })
    if (!user) return
    await this.prisma.userSubscription.updateMany({
      where: { userId: user.id },
      data: {
        subscriptionStatus: 'canceled',
      },
    })

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        stripeSubscriptionId: null,
      },
    })
  }
}
