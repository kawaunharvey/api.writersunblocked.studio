import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AppConfigService } from '../common/config/app-config.service'
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

  async upsertGoogleUser(data: GoogleUserData) {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { name: data.name, image: data.image },
      });
    }

    // Validate referral code and determine trial duration
    let trialDays = 7; // default
    let referredByWaitlistCode: string | undefined;

    if (data.referralCode) {
      const referralValidation = await this.validateAndApplyReferralCode(
        data.referralCode,
        data.email,
      );
      if (referralValidation.valid) {
        trialDays = 30;
        referredByWaitlistCode = data.referralCode;
      }
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    return this.prisma.user.create({
      data: {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        image: data.image,
        subscriptionStatus: 'trialing',
        trialEndsAt,
        referredByWaitlistCode,
      },
    });
  }

  private async validateAndApplyReferralCode(
    referralCode: string,
    userEmail: string,
  ): Promise<{ valid: boolean }> {
    try {
      const normalizedCode = referralCode.trim().toUpperCase();

      const waitlistEntry = await this.prisma.waitlist.findUnique({
        where: { referralCode: normalizedCode },
      });

      // Referral code must exist, be confirmed, and match the email
      if (
        !waitlistEntry ||
        !waitlistEntry.confirmedAt ||
        waitlistEntry.email.toLowerCase() !== userEmail.toLowerCase()
      ) {
        return { valid: false };
      }

      return { valid: true };
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
