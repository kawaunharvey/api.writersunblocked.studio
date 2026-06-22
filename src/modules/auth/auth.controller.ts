import { AppConfigService } from '@/common/config/app-config.service'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { IsEmail, IsOptional, IsString, Length } from 'class-validator'
import { AuthService } from './auth.service'
import { getAuthCookieDomain, getJwtCookieOptions } from './auth-cookie.util'
import { EmailAuthService } from './email-auth.service'
import { Public } from './public.decorator'
import { SiteApiKeyGuard } from './site-api-key.guard'

type WaitlistRejectionUser = { waitlistRejection: string };

class SendEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

class VerifyEmailCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(5, 5)
  code!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailAuthService: EmailAuthService,
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
      | {
          user: {
            id: string;
            email: string;
            subscriptionStatus: string | null;
          };
          isNew: boolean;
        }
      | WaitlistRejectionUser;

    if ('waitlistRejection' in user) {
      const redirectUrl = new URL(this.getDefaultRedirectOrigin());
      redirectUrl.searchParams.set('error', user.waitlistRejection);
      return res.redirect(redirectUrl.toString());
    }

    const { user: authUser, isNew } = user;
    const mode: string | undefined = req.cookies?.oauth_mode;
    const returnTo: string | undefined = req.cookies?.oauth_return_to;

    const token = this.authService.issueJwt(authUser);
    const isProduction = this.config.nodeEnv === 'production';
    const cookieDomain = getAuthCookieDomain(this.config, isProduction);

    res.clearCookie('oauth_mode', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });
    res.clearCookie('oauth_return_to', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });

    if (cookieDomain) {
      res.clearCookie('jwt', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      });
    }

    res.cookie('jwt', token, getJwtCookieOptions(this.config));

    if (mode === 'signup' && !isNew) {
      const redirectUrl = new URL(this.resolveRedirectUrl(returnTo));
      redirectUrl.searchParams.set('notice', 'existing_account');
      return res.redirect(redirectUrl.toString());
    }

    return res.redirect(this.resolveRedirectUrl(returnTo));
  }

  @Public()
  @UseGuards(SiteApiKeyGuard)
  @Post('email/send-code')
  @HttpCode(200)
  async sendEmailCode(@Body() dto: SendEmailCodeDto) {
    const result = await this.emailAuthService.sendCode(dto.email, dto.referralCode);
    return { ok: true, codeLength: result.codeLength };
  }

  @Public()
  @UseGuards(SiteApiKeyGuard)
  @Post('email/verify')
  @HttpCode(200)
  async verifyEmailCode(@Body() dto: VerifyEmailCodeDto) {
    const stored = await this.emailAuthService.verifyCode(dto.email, dto.code);
    const referralCode = dto.referralCode ?? stored.referralCode;
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.authService.findUserByEmail(normalizedEmail);

    try {
      const { user, isNew } = existingUser
        ? {
            user: {
              ...existingUser,
              subscriptionStatus: existingUser.subscription?.subscriptionStatus ?? null,
            },
            isNew: false,
          }
        : await this.authService.upsertEmailUser(
            { email: normalizedEmail },
            { referralCode },
          );

      const token = this.authService.issueJwt(user);
      return { token, isNew };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'referral_required') {
          throw new BadRequestException('A valid referral is required to create an account');
        }
        if (error.message === 'invalid_referral') {
          throw new BadRequestException('Invalid referral code');
        }
      }

      throw error;
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: any) {
    const isProduction = this.config.nodeEnv === 'production';
    const cookieDomain = getAuthCookieDomain(this.config, isProduction);

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

  private getDefaultRedirectOrigin(): string {
    return this.config.marketingSiteOrigin ?? this.config.nextJsOrigin;
  }

  private resolveRedirectUrl(returnTo?: string): string {
    if (!returnTo) {
      return `${this.getDefaultRedirectOrigin()}/signup/profile`;
    }

    try {
      const url = new URL(returnTo);
      const allowedOrigins = new Set([
        ...this.config.allowedCorsOrigins,
        this.config.nextJsOrigin,
        ...(this.config.marketingSiteOrigin ? [this.config.marketingSiteOrigin] : []),
      ]);

      if (!allowedOrigins.has(url.origin)) {
        throw new UnauthorizedException('Invalid return URL');
      }

      return url.toString();
    } catch {
      return `${this.getDefaultRedirectOrigin()}/signup/profile`;
    }
  }
}
