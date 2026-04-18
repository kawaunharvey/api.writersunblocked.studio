import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from './env.validation';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvVars, true>) {}

  get nodeEnv(): 'development' | 'test' | 'production' {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  get nextJsOrigin(): string {
    return this.configService.get('NEXTJS_ORIGIN', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string {
    return this.configService.get('REDIS_URL', { infer: true });
  }

  get aiProvider(): 'anthropic' | 'openai' {
    return this.configService.get('AI_PROVIDER', { infer: true });
  }

  get anthropicApiKey(): string | undefined {
    return this.configService.get('ANTHROPIC_API_KEY', { infer: true });
  }

  get openAiApiKey(): string | undefined {
    return this.configService.get('OPENAI_API_KEY', { infer: true });
  }

  // Auth
  get googleClientId(): string {
    return this.configService.get('GOOGLE_CLIENT_ID', { infer: true });
  }

  get googleClientSecret(): string {
    return this.configService.get('GOOGLE_CLIENT_SECRET', { infer: true });
  }

  get googleCallbackUrl(): string {
    return this.configService.get('GOOGLE_CALLBACK_URL', { infer: true });
  }

  get jwtSecret(): string {
    return this.configService.get('JWT_SECRET', { infer: true });
  }

  get jwtExpiry(): string {
    return this.configService.get('JWT_EXPIRY', { infer: true });
  }

  get internalApiSecret(): string {
    return this.configService.get('INTERNAL_API_SECRET', { infer: true });
  }

  // Payments
  get stripeSecretKey(): string {
    return this.configService.get('STRIPE_SECRET_KEY', { infer: true });
  }

  get stripeWebhookSecret(): string {
    return this.configService.get('STRIPE_WEBHOOK_SECRET', { infer: true });
  }

  get stripePriceId(): string {
    return this.configService.get('STRIPE_PRICE_ID', { infer: true });
  }

  // Email
  get mailgunApiKey(): string {
    return this.configService.get('MAILGUN_API_KEY', { infer: true });
  }

  get mailgunDomain(): string {
    return this.configService.get('MAILGUN_DOMAIN', { infer: true });
  }

  get mailgunFrom(): string {
    return this.configService.get('MAILGUN_FROM', { infer: true });
  }

  get waitlistConfirmUrl(): string {
    return this.configService.get('WAITLIST_CONFIRM_URL', { infer: true });
  }

  // App config
  get simulationPriorWeight(): number {
    return this.configService.get('SIMULATION_WEIGHT_PRIOR_WINDOW', { infer: true });
  }

  get blockWindowSize(): number {
    return this.configService.get('BLOCK_WINDOW_SIZE', { infer: true });
  }

  get maxConcurrentJobsPerStory(): number {
    return this.configService.get('MAX_CONCURRENT_JOBS_PER_STORY', { infer: true });
  }

  get maxConcurrentAiCalls(): number {
    return this.configService.get('MAX_CONCURRENT_AI_CALLS', { infer: true });
  }

  get eventRetentionDays(): number {
    return this.configService.get('EVENT_RETENTION_DAYS', { infer: true });
  }
}
