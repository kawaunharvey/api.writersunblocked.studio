import { AppConfigService } from '@/common/config/app-config.service'
import { isInternalEmail } from '@/common/utils/internal-email.util'
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Profile, Strategy } from 'passport-google-oauth20'
import { AuthService, type WaitlistRejectionReason } from './auth.service'

type WaitlistRejectionUser = {
  waitlistRejection: WaitlistRejectionReason;
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: AppConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: config.googleCallbackUrl,
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: any,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<WaitlistRejectionUser | { user: any; isNew: boolean }> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('No email returned from Google OAuth');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const googleUserData = {
      googleId: profile.id,
      email: normalizedEmail,
      name: profile.displayName ?? null,
      image: profile.photos?.[0]?.value ?? null,
    };
    const mode = req.cookies?.oauth_mode;

    if (mode === 'login') {
      try {
        return await this.authService.authenticateGoogleUser(googleUserData);
      } catch (error) {
        if (error instanceof Error && error.message === 'no_account') {
          return { waitlistRejection: 'no_account' };
        }

        throw error;
      }
    }

    const referralCode = typeof req.cookies?.referredBy === 'string' ? req.cookies.referredBy : undefined;
    let hasValidReferralCode = false;

    const shouldBypassWaitlist = isInternalEmail(normalizedEmail);
    if (!shouldBypassWaitlist) {
      const existing = await this.authService.findUserByGoogleId(profile.id);
      if (!existing) {
        // Check if user has a valid referral code (can bypass waitlist)
        hasValidReferralCode =
          typeof referralCode === 'string'
            ? (await this.authService.validateAndApplyReferralCode(referralCode)).valid
            : false;

        // Only check waitlist if no valid referral code
        if (!hasValidReferralCode) {
          const access = await this.authService.checkNewUserWaitlistAccess(normalizedEmail);
          if (!access.ok) {
            return { waitlistRejection: access.reason };
          }
        }
      }
    }

    return this.authService.upsertGoogleUser(googleUserData, {
      referralCode: hasValidReferralCode ? referralCode : undefined,
    });
  }
}
