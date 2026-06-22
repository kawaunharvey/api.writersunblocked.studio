import { AppConfigService } from '@/common/config/app-config.service'
import { MailgunService } from '@/email/mailgun.service'
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import Redis from 'ioredis'

const CODE_LENGTH = 5;
const OTP_TTL_SECONDS = 600;
const RATE_LIMIT_SECONDS = 60;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type StoredOtp = {
  codeHash: string;
  referralCode?: string;
};

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(length: number): string {
  const bytes = randomBytes(length);
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length];
  }

  return code;
}

@Injectable()
export class EmailAuthService {
  private readonly redis: Redis;
  private readonly logger = new Logger(EmailAuthService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly mailgun: MailgunService,
  ) {
    const url = new URL(config.redisUrl);
    this.redis = new Redis({
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    });
  }

  private otpKey(email: string): string {
    return `email-auth:${normalizeEmail(email)}`;
  }

  private rateLimitKey(email: string): string {
    return `email-auth-rate:${normalizeEmail(email)}`;
  }

  async sendCode(email: string, referralCode?: string): Promise<{ codeLength: number }> {
    const normalizedEmail = normalizeEmail(email);
    const rateLimitKey = this.rateLimitKey(normalizedEmail);
    const wasRateLimited = await this.redis.set(rateLimitKey, '1', 'EX', RATE_LIMIT_SECONDS, 'NX');

    if (!wasRateLimited) {
      throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = generateCode(CODE_LENGTH);
    const payload: StoredOtp = {
      codeHash: hashCode(code),
      ...(referralCode ? { referralCode: referralCode.trim().toUpperCase() } : {}),
    };

    await this.redis.set(
      this.otpKey(normalizedEmail),
      JSON.stringify(payload),
      'EX',
      OTP_TTL_SECONDS,
    );

    await this.mailgun.sendVerificationCode(normalizedEmail, code);

    this.logger.log(`Verification code sent to ${normalizedEmail}`);

    return { codeLength: CODE_LENGTH };
  }

  async verifyCode(email: string, code: string): Promise<{ referralCode?: string }> {
    const normalizedEmail = normalizeEmail(email);
    const raw = await this.redis.get(this.otpKey(normalizedEmail));

    if (!raw) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    let stored: StoredOtp;
    try {
      stored = JSON.parse(raw) as StoredOtp;
    } catch {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (stored.codeHash !== hashCode(code.trim())) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.redis.del(this.otpKey(normalizedEmail));

    return { referralCode: stored.referralCode };
  }
}
