import { randomBytes, createHash } from 'crypto';
import { BadRequestException, Body, ConflictException, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { AppConfigService } from '../common/config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { MailgunService } from '../email/mailgun.service';
import { Public } from '../auth/public.decorator';

const REFERRAL_CODE_LENGTH = 8;
const CONFIRMATION_TOKEN_BYTES = 32;
const CONFIRMATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

class WaitlistDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]{8}$/)
  referralCode?: string;
}

class ConfirmWaitlistDto {
  @IsString()
  @MinLength(32)
  token: string;
}

@Controller('waitlist')
export class WaitlistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailgun: MailgunService,
    private readonly config: AppConfigService,
  ) {}

  private async createUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomBytes(8)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, REFERRAL_CODE_LENGTH)
        .toUpperCase();

      if (code.length !== REFERRAL_CODE_LENGTH) {
        continue;
      }

      const existing = await this.prisma.waitlist.findUnique({ where: { referralCode: code } });
      if (!existing) {
        return code;
      }
    }

    throw new ConflictException('Could not generate referral code. Please retry.');
  }

  private buildConfirmationLink(rawToken: string): string {
    const url = new URL(this.config.waitlistConfirmUrl);
    url.searchParams.set('token', rawToken);
    return url.toString();
  }

  private async getPosition(waitlistId: string): Promise<{ position: number; totalConfirmed: number }> {
    const confirmedWaitlisters = await this.prisma.waitlist.findMany({
      where: { confirmedAt: { not: null } },
      select: {
        id: true,
        referralsCount: true,
        referredById: true,
        confirmedAt: true,
        createdAt: true,
      },
    });

    const ordered = confirmedWaitlisters.sort((a, b) => {
      if (a.referralsCount !== b.referralsCount) {
        return b.referralsCount - a.referralsCount;
      }

      const aWasReferred = a.referredById ? 1 : 0;
      const bWasReferred = b.referredById ? 1 : 0;
      if (aWasReferred !== bWasReferred) {
        return bWasReferred - aWasReferred;
      }

      const aConfirmedAt = a.confirmedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bConfirmedAt = b.confirmedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aConfirmedAt !== bConfirmedAt) {
        return aConfirmedAt - bConfirmedAt;
      }

      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const index = ordered.findIndex((entry) => entry.id === waitlistId);
    return { position: index >= 0 ? index + 1 : ordered.length + 1, totalConfirmed: ordered.length };
  }

  @Public()
  @Post()
  async join(@Body() dto: WaitlistDto) {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.waitlist.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Already on waitlist');

    const referralCode = await this.createUniqueReferralCode();
    const confirmationToken = randomBytes(CONFIRMATION_TOKEN_BYTES).toString('hex');
    const confirmationTokenHash = hashToken(confirmationToken);
    const confirmationTokenExpiresAt = new Date(Date.now() + CONFIRMATION_TOKEN_TTL_MS);

    let referredById: string | undefined;
    const providedReferralCode = dto.referralCode?.trim().toUpperCase();
    if (providedReferralCode) {
      const referrer = await this.prisma.waitlist.findUnique({ where: { referralCode: providedReferralCode } });
      referredById = referrer?.id;
    }

    await this.prisma.waitlist.create({
      data: {
        email,
        referralCode,
        referredById,
        confirmationTokenHash,
        confirmationTokenExpiresAt,
      },
    });

    const confirmationLink = this.buildConfirmationLink(confirmationToken);
    await this.mailgun.sendWaitlistWelcome(email, confirmationLink);

    return { ok: true, needsConfirmation: true };
  }

  @Public()
  @Post('confirm')
  async confirm(@Body() dto: ConfirmWaitlistDto) {
    const tokenHash = hashToken(dto.token);

    const existing = await this.prisma.waitlist.findFirst({
      where: {
        confirmationTokenHash: tokenHash,
        confirmationTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!existing) {
      throw new BadRequestException('Invalid or expired confirmation token');
    }

    const now = new Date();

    const confirmed = await this.prisma.waitlist.update({
      where: { id: existing.id },
      data: {
        confirmedAt: existing.confirmedAt ?? now,
        confirmationTokenHash: null,
        confirmationTokenExpiresAt: null,
      },
    });

    if (confirmed.referredById) {
      const credited = await this.prisma.waitlist.updateMany({
        where: { id: confirmed.id, referralCreditedAt: null },
        data: { referralCreditedAt: now },
      });

      if (credited.count > 0) {
        await this.prisma.waitlist.update({
          where: { id: confirmed.referredById },
          data: { referralsCount: { increment: 1 } },
        });
      }
    }

    const latest = await this.prisma.waitlist.findUniqueOrThrow({ where: { id: confirmed.id } });
    const rank = await this.getPosition(latest.id);

    return {
      ok: true,
      confirmed: true,
      position: rank.position,
      totalConfirmed: rank.totalConfirmed,
      referralsCount: latest.referralsCount,
      referralCode: latest.referralCode,
      referralLink: `${this.config.nextJsOrigin}/waitlist?ref=${latest.referralCode}`,
    };
  }
}
