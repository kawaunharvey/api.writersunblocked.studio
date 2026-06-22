import { AppConfigService } from '@/common/config/app-config.service'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

@Injectable()
export class SiteApiKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const key = request.headers['x-site-api-key'];

    if (!key || key !== this.config.siteApiKey) {
      throw new UnauthorizedException('Invalid site API key');
    }

    return true;
  }
}
