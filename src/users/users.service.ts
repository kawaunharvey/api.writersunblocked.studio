import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'

const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async isHandleTaken(handle: string): Promise<boolean> {
    const normalized = normalizeHandle(handle);
    const existing = await this.prisma.user.findUnique({ where: { handle: normalized } });
    return existing !== null;
  }

  async updateHandle(userId: string, handle: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { handle: normalizeHandle(handle) },
    });
  }

  async updateName(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });
  }

  async updateSubscription(
    userId: string,
    data: {
      subscriptionStatus?: string;
      subscriptionOfferId?: string | null;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      currentPeriodEnd?: Date;
      trialEndsAt?: Date;
    },
  ) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async getReferralInfo(userId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { userId },
    });

    if (!referral) {
      return { isEligible: false, paidReferralsCount: 0, freeMonthsEarned: 0 };
    }

    const paidReferralsCount = referral.paidReferralsCount;
    const freeMonthsEarned = Math.floor(paidReferralsCount / 3);

    return {
      isEligible: true,
      referralLink: `${process.env.NEXT_JS_ORIGIN || 'https://writersunblocked.studio'}/invite/${referral.referralCode}`,
      paidReferralsCount,
      freeMonthsEarned,
    };
  }

  async applyReferral(
    userId: string,
    code: string,
  ): Promise<{ applied: boolean; trialEndsAt?: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredByReferralId: true, trialEndsAt: true },
    });

    // Already used a referral
    if (!user || user.referredByReferralId) {
      return { applied: false };
    }

    const normalizedCode = code.trim().toUpperCase();
    const referral = await this.prisma.referral.findUnique({
      where: { referralCode: normalizedCode },
    });

    if (!referral) {
      return { applied: false };
    }

    // Self-referral guard
    if (referral.userId === userId) {
      return { applied: false };
    }

    // Extend trial: max(existing trialEndsAt, now + 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const trialEndsAt =
      user.trialEndsAt && user.trialEndsAt > thirtyDaysFromNow
        ? user.trialEndsAt
        : thirtyDaysFromNow;

    await this.prisma.user.update({
      where: { id: userId },
      data: { referredByReferralId: referral.id, trialEndsAt },
    });

    await this.prisma.referral.update({
      where: { id: referral.id },
      data: { referralsCount: { increment: 1 } },
    });

    return { applied: true, trialEndsAt };
  }

  async updateNotifications(userId: string, preferences: Record<string, any>) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        notificationPreferences: preferences,
      },
    });
  }

  async softDeleteUser(userId: string) {
    // Soft delete: anonymize PII and cancel Stripe subscription
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Cancel Stripe subscription if active
    if (user.stripeCustomerId) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2026-03-25.dahlia',
        });

        // Find and cancel the subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          await stripe.subscriptions.cancel(subscriptions.data[0].id);
        }
      } catch (error) {
        // Log error but continue with deletion
        console.error('Error canceling Stripe subscription:', error);
      }
    }

    // Soft delete by anonymizing user
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.local`,
        name: 'Deleted User',
        handle: null,
        googleId: null,
        subscriptionStatus: 'canceled',
        notificationPreferences: null,
      },
    });
  }
}
