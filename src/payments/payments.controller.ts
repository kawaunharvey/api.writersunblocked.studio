import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { StripeService } from './stripe.service';
import type { RecurringInterval } from './stripe.service';
import { PrismaService } from '../database/prisma.service';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Offer {
  id: string;
  priceId?: string;
  name: string;
  description: string;
  price: string;
  amountCents?: number;
  currency?: string;
  interval: RecurringInterval;
  badge?: string;
  isActive: boolean;
}

export class CreateCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  offerId!: string;

  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  successUrl!: string;

  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  cancelUrl!: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  private getActiveOffers(): Offer[] {
    const candidatePaths = [
      join(process.cwd(), 'src/payments/offers.json'),
      join(process.cwd(), 'dist/payments/offers.json'),
    ];

    const offersPath = candidatePaths.find((path) => existsSync(path));
    if (!offersPath) {
      return [];
    }

    const raw = readFileSync(offersPath, 'utf8');
    const parsed = JSON.parse(raw) as Offer[];
    return parsed.filter((offer) => offer.isActive);
  }

  @Public()
  @Get('offers')
  getOffers(): Offer[] {
    return this.getActiveOffers();
  }

  @Post('checkout-session')
  async createCheckoutSession(
    @Req() req: any,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    const { userId } = req.user as { userId: string };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await this.stripeService.createCustomer(
        user.email,
        user.name,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const normalizedOfferId = (dto.offerId ?? '').trim();
    const activeOffers = this.getActiveOffers();
    const offer = activeOffers.find((item) => item.id === normalizedOfferId);
    if (!offer) {
      throw new BadRequestException({
        message: 'Invalid offerId',
        receivedOfferId: normalizedOfferId,
        availableOfferIds: activeOffers.map((item) => item.id),
      });
    }
    if (!offer.priceId && (!offer.amountCents || offer.amountCents < 1)) {
      throw new BadRequestException(
        'Offer must provide either priceId or amountCents',
      );
    }

    const url = await this.stripeService.createCheckoutSession(
      customerId,
      offer,
      dto.successUrl,
      dto.cancelUrl,
    );

    return { url };
  }
}
