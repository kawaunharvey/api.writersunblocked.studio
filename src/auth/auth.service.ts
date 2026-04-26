import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AppConfigService } from '../common/config/app-config.service'
import { generateReferralCode } from '../common/utils/referral-code.util'
import { PrismaService } from '../database/prisma.service'
import type { JwtPayload } from './jwt.strategy'

interface GoogleUserData {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
  referralCode?: string | null;
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

  async upsertGoogleUser(data: GoogleUserData): Promise<{ user: any; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
      include: { referral: true },
    });

    if (existing) {
      // Lazily create a Referral record for existing users that don't have one yet
      if (!existing.referral) {
        await this.createReferralForUser(existing.id);
      }

      // Apply referral benefit to existing users — only once (no prior referral)
      if (data.referralCode && !existing.referredByReferralId) {
        const referralValidation = await this.validateAndApplyReferralCode(data.referralCode);
        if (referralValidation.valid && referralValidation.referralId) {
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 30);
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { referredByReferralId: referralValidation.referralId, trialEndsAt },
          });
          await this.prisma.referral.update({
            where: { id: referralValidation.referralId },
            data: { referralsCount: { increment: 1 } },
          });
        }
      }

      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { name: data.name, image: data.image },
      });
      return { user, isNew: false };
    }

    // Validate referral code and determine trial duration
    let trialDays = 7; // default
    let referredByReferralId: string | undefined;

    if (data.referralCode) {
      const referralValidation = await this.validateAndApplyReferralCode(data.referralCode);
      if (referralValidation.valid && referralValidation.referralId) {
        trialDays = 30;
        referredByReferralId = referralValidation.referralId;
      }
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const newUser = await this.prisma.user.create({
      data: {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        image: data.image,
        subscriptionStatus: 'trialing',
        trialEndsAt,
        referredByReferralId,
      },
    });

    // Create Referral record; also increment referralsCount on the referrer
    await this.createReferralForUser(newUser.id);

    if (referredByReferralId) {
      await this.prisma.referral.update({
        where: { id: referredByReferralId },
        data: { referralsCount: { increment: 1 } },
      });
    }

    return { user: newUser, isNew: true };
  }

  private async createReferralForUser(userId: string): Promise<void> {
    const code = await generateReferralCode(async (candidate) => {
      const existing = await this.prisma.referral.findUnique({ where: { referralCode: candidate } });
      return existing === null;
    });
    await this.prisma.referral.create({
      data: { userId, referralCode: code },
    });
  }

  private async validateAndApplyReferralCode(
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
