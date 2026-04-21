import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AppConfigService } from '../common/config/app-config.service';
import { AuthService, type WaitlistRejectionReason } from './auth.service';

const INTERNAL_EMAIL_DOMAIN = '@thehereafter.tech';

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
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<WaitlistRejectionUser | Awaited<ReturnType<AuthService['upsertGoogleUser'>>> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('No email returned from Google OAuth');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const shouldBypassWaitlist = normalizedEmail.endsWith(INTERNAL_EMAIL_DOMAIN);
    if (!shouldBypassWaitlist) {
      const existing = await this.authService.findUserByGoogleId(profile.id);
      if (!existing) {
        const access = await this.authService.checkNewUserWaitlistAccess(normalizedEmail);
        if (!access.ok) {
          return { waitlistRejection: access.reason };
        }
      }
    }

    const user = await this.authService.upsertGoogleUser({
      googleId: profile.id,
      email: normalizedEmail,
      name: profile.displayName ?? null,
      image: profile.photos?.[0]?.value ?? null,
    });
    return user;
  }
}
