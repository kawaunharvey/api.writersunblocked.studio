import {
    Controller,
    Get,
    HttpCode,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AppConfigService } from '../common/config/app-config.service'
import { AuthService } from './auth.service'
import { Public } from './public.decorator'

type WaitlistRejectionUser = { waitlistRejection: string }

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google — referral code captured in GoogleStrategy
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
      async googleCallback(@Req() req: any, @Res() res: any) {
    const user = req.user as
      | { user: { id: string; email: string; subscriptionStatus: string | null }; isNew: boolean }
      | WaitlistRejectionUser;

    if ('waitlistRejection' in user) {
      const redirectUrl = new URL(this.config.nextJsOrigin);
      redirectUrl.searchParams.set('error', user.waitlistRejection);
      return res.redirect(redirectUrl.toString());
    }

    const { user: authUser, isNew } = user;
    const mode: string | undefined = req.cookies?.oauth_mode;

    const token = this.authService.issueJwt(authUser);
    const isProduction = this.config.nodeEnv === 'production';
    const cookieDomain = this.getCookieDomain(isProduction);

    // Clear the short-lived OAuth mode cookie — it has done its job.
    res.clearCookie('oauth_mode', { httpOnly: true, secure: isProduction, sameSite: 'lax' });

    if (cookieDomain) {
      // Clear legacy host-only cookie so only one jwt cookie remains.
      res.clearCookie('jwt', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      });
    }

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Soft-block path mismatch: existing user on signup path → inform them
    if (mode === 'signup' && !isNew) {
      return res.redirect(`${this.config.nextJsOrigin}/dashboard?notice=existing_account`);
    }

    res.redirect(`${this.config.nextJsOrigin}/dashboard`);
  }

  @Post('logout')
  @HttpCode(200)
      logout(@Res({ passthrough: true }) res: any) {
    const isProduction = this.config.nodeEnv === 'production';
    const cookieDomain = this.getCookieDomain(isProduction);

    // Always clear host-only cookie in case it was set before domain sharing was enabled.
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    res.clearCookie('jwt', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
    return { ok: true };
  }

  private getCookieDomain(isProduction: boolean): string | undefined {
    if (!isProduction) return undefined;
    if (this.config.authCookieDomain) return this.config.authCookieDomain;

    try {
      const host = new URL(this.config.nextJsOrigin).hostname.toLowerCase();
      if (host === 'localhost' || host.endsWith('.localhost')) return undefined;

      if (host.startsWith('www.')) {
        return `.${host.slice(4)}`;
      }

      return `.${host}`;
    } catch {
      return undefined;
    }
  }
}
