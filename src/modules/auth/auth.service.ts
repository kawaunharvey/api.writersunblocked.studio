import { AppConfigService } from '@/common/config/app-config.service'
import { generateReferralCode } from '@/common/utils/referral-code.util'
import { PrismaService } from '@/database/prisma.service'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { PaidSubscriptionTier, SubscriptionStatus } from '@prisma/client'
import type { JwtPayload } from './jwt.strategy'

interface GoogleUserData {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
}

interface EmailUserData {
  email: string;
}

interface SignupContext {
  referralCode?: string;
}

export type WaitlistRejectionReason =
  | 'not_on_waitlist'
  | 'not_confirmed'
  | 'pending_approval';

export type WaitlistAccessResult =
  | { ok: true }
  | { ok: false; reason: WaitlistRejectionReason };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async upsertGoogleUser(
    data: GoogleUserData,
    context?: SignupContext,
  ): Promise<{ user: any; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
      include: { referral: true, subscription: true },
    });

    if (existing) {
      // Lazily create a Referral record for existing users that don't have one yet
      if (!existing.referral) {
        await this.createReferralForUser(existing.id);
      }

      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { name: data.name, image: data.image },
      });

      return {
        user: {
          ...user,
          subscriptionStatus: existing.subscription?.subscriptionStatus ?? null,
        },
        isNew: false,
      };
    }

    const referralTrialDays = context?.referralCode
      ? await this.getTrialLengthDaysForReferralCode(context.referralCode)
      : null;
    // New users coming through referral use referral-configured trial length.
    const trialDays = referralTrialDays ?? await this.getTrialLengthDaysForEmail(data.email);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    const expiresAt = new Date(trialEndsAt);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          googleId: data.googleId,
          email: data.email,
          name: data.name,
          image: data.image,
        },
      });

      await tx.userSubscription.create({
        data: {
          userId: createdUser.id,
          tier: 'starter' as PaidSubscriptionTier,
          subscriptionStatus: 'trialing' as SubscriptionStatus,
          trialEndsAt,
          expiresAt,
          metadata: {
            trialLengthDays: trialDays,
            source: referralTrialDays ? 'referral' : 'waitlist',
          },
        },
      });

      return createdUser;
    });

    // Create Referral record for the new user
    await this.createReferralForUser(newUser.id);

    return {
      user: {
        ...newUser,
        subscriptionStatus: 'trialing',
      },
      isNew: true,
    };
  }

  async upsertEmailUser(
    data: EmailUserData,
    context?: SignupContext,
  ): Promise<{ user: any; isNew: boolean }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { referral: true, subscription: true },
    });

    if (existing) {
      if (!existing.referral) {
        await this.createReferralForUser(existing.id);
      }

      return {
        user: {
          ...existing,
          subscriptionStatus: existing.subscription?.subscriptionStatus ?? null,
        },
        isNew: false,
      };
    }

    const referralCode = context?.referralCode?.trim().toUpperCase();
    if (!referralCode) {
      throw new Error('referral_required');
    }

    const referralValidation = await this.validateAndApplyReferralCode(referralCode);
    if (!referralValidation.valid) {
      throw new Error('invalid_referral');
    }

    const referralTrialDays = await this.getTrialLengthDaysForReferralCode(referralCode);
    const trialDays = referralTrialDays ?? 7;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    const expiresAt = new Date(trialEndsAt);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
        },
      });

      await tx.userSubscription.create({
        data: {
          userId: createdUser.id,
          tier: 'starter' as PaidSubscriptionTier,
          subscriptionStatus: 'trialing' as SubscriptionStatus,
          trialEndsAt,
          expiresAt,
          metadata: {
            trialLengthDays: trialDays,
            source: 'referral',
          },
        },
      });

      return createdUser;
    });

    await this.createReferralForUser(newUser.id);

    return {
      user: {
        ...newUser,
        subscriptionStatus: 'trialing',
      },
      isNew: true,
    };
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { subscription: true },
    });
  }

  private async getTrialLengthDaysForEmail(email: string): Promise<number> {
    const waitlistEntry = await this.prisma.waitlist.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { trialLengthDays: true },
    });

    const rawTrialDays = waitlistEntry?.trialLengthDays;
    if (typeof rawTrialDays !== 'number' || !Number.isFinite(rawTrialDays)) {
      return 7;
    }

    const trialDays = Math.floor(rawTrialDays);
    return trialDays > 0 ? trialDays : 7;
  }

  private async getTrialLengthDaysForReferralCode(referralCode: string): Promise<number | null> {
    const normalizedCode = referralCode.trim().toUpperCase();
    if (!normalizedCode) {
      return null;
    }

    const referral = await this.prisma.referral.findUnique({
      where: { referralCode: normalizedCode },
      select: { trialLengthDays: true },
    });

    const rawTrialDays = referral?.trialLengthDays;
    if (typeof rawTrialDays !== 'number' || !Number.isFinite(rawTrialDays)) {
      return null;
    }

    const trialDays = Math.floor(rawTrialDays);
    return trialDays > 0 ? trialDays : null;
  }

  private async createReferralForUser(userId: string): Promise<void> {
    const code = await generateReferralCode(async (candidate) => {
      const existing = await this.prisma.referral.findUnique({ where: { referralCode: candidate } });
      return existing === null;
    });
    await this.prisma.referral.create({
      data: { userId, referralCode: code, trialLengthDays: 30 },
    });
  }

  async validateAndApplyReferralCode(
    referralCode: string,
  ): Promise<{ valid: boolean; referralId?: string }> {
    try {
      const normalizedCode = referralCode.trim().toUpperCase();

      const referral = await this.prisma.referral.findUnique({
        where: { referralCode: normalizedCode },
      });

      if (!referral) {
        return { valid: false };
      }

      return { valid: true, referralId: referral.id };
    } catch {
      return { valid: false };
    }
  }

  async findUserByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async checkNewUserWaitlistAccess(email: string): Promise<WaitlistAccessResult> {
    const waitlistEntry = await this.prisma.waitlist.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        confirmedAt: true,
        approved: true,
      },
    });

    if (!waitlistEntry) {
      return { ok: false, reason: 'not_on_waitlist' };
    }

    if (!waitlistEntry.confirmedAt) {
      return { ok: false, reason: 'not_confirmed' };
    }

    if (!waitlistEntry.approved) {
      return { ok: false, reason: 'pending_approval' };
    }

    return { ok: true };
  }

  issueJwt(user: { id: string; email: string; subscriptionStatus: string | null }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
    };
    return this.jwtService.sign(payload);
  }
}
