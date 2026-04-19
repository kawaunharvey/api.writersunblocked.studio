import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../common/config/app-config.service';
import { PrismaService } from '../database/prisma.service';

export type RecurringInterval = 'day' | 'week' | 'month' | 'year';

export interface CheckoutOfferPricing {
  id: string;
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
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000),
      },
    });
    this.logger.log(`Subscription updated for user ${user.id}: ${subscription.status}`);
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
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    });
  }
}
