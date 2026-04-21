import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common'
import { IsNotEmpty, IsString, IsUrl } from 'class-validator'
import { Public } from '../auth/public.decorator'
import { PrismaService } from '../database/prisma.service'
import type { OfferTier } from './offers'
import { getOfferById, OFFERS } from './offers'
import type { RecurringInterval } from './stripe.service'
import { StripeService } from './stripe.service'

export interface Offer {
  id: string;
  tier: OfferTier;
  priceId?: string;
  name: string;
  description: string;
  price: string;
  amountCents?: number;
  currency?: string;
  interval: RecurringInterval;
  badge?: string;
  isActive: boolean;
  includes?: string[];
  maxBlocksAnalyzed?: number | 'unlimited';
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
    return OFFERS.filter((offer) => offer.isActive);
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
    const offer = getOfferById(normalizedOfferId);
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
