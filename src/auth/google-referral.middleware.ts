import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/**
 * Captures the `referral` query param from GET /auth/google
 * and stores it in a short-lived httpOnly cookie so it survives
 * the round-trip through Google's OAuth redirect.
 *
 * The cookie is read in GoogleStrategy.validate() and cleared
 * in the auth callback after a user is successfully upserted.
 */
@Injectable()
export class GoogleReferralMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
    };

    const mode = req.query?.mode;
    if (mode === 'signup' || mode === 'login') {
      res.cookie('oauth_mode', mode, cookieOptions);
    }

    next();
  }
}
