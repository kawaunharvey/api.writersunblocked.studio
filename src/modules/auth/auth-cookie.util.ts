import type { AppConfigService } from '@/common/config/app-config.service'

export const JWT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getAuthCookieDomain(
  config: AppConfigService,
  isProduction: boolean,
): string | undefined {
  if (!isProduction) {
    return undefined;
  }

  if (config.authCookieDomain) {
    return config.authCookieDomain;
  }

  try {
    const host = new URL(config.nextJsOrigin).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return undefined;
    }

    if (host.startsWith('www.')) {
      return `.${host.slice(4)}`;
    }

    return `.${host}`;
  } catch {
    return undefined;
  }
}

export function getJwtCookieOptions(config: AppConfigService) {
  const isProduction = config.nodeEnv === 'production';
  const domain = getAuthCookieDomain(config, isProduction);

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    ...(domain ? { domain } : {}),
    maxAge: JWT_COOKIE_MAX_AGE_MS,
  };
}
