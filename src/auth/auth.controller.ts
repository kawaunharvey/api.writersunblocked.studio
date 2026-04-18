import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AppConfigService } from '../common/config/app-config.service';
import { Public } from './public.decorator';

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
    // Passport redirects to Google — no body needed
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
      async googleCallback(@Req() req: any, @Res() res: any) {
    const user = req.user as { id: string; email: string; subscriptionStatus: string | null };
    const token = this.authService.issueJwt(user);
    const isProduction = this.config.nodeEnv === 'production';

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${this.config.nextJsOrigin}/dashboard`);
  }

  @Post('logout')
  @HttpCode(200)
      logout(@Res({ passthrough: true }) res: any) {
    const isProduction = this.config.nodeEnv === 'production';

    res.clearCookie('jwt', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });
    return { ok: true };
  }
}
