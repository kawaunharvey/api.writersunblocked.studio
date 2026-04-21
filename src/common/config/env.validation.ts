import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTJS_ORIGIN: z.string().url(),

  // Auth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('7d'),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  INTERNAL_API_SECRET: z.string().min(1).default('change-me'),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Payments
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Email
  MAILGUN_API_KEY: z.string().min(1),
  MAILGUN_DOMAIN: z.string().min(1),
  MAILGUN_FROM: z.string().min(1),
  WAITLIST_CONFIRM_URL: z.string().url(),

  // App config
  SIMULATION_WEIGHT_PRIOR_WINDOW: z.coerce.number().default(0.4),
  BLOCK_WINDOW_SIZE: z.coerce.number().int().positive().default(2),
  MAX_CONCURRENT_JOBS_PER_STORY: z.coerce.number().int().positive().default(3),
  MAX_CONCURRENT_AI_CALLS: z.coerce.number().int().positive().default(20),
  EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(60),
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvVars {
  return envSchema.parse(config);
}
