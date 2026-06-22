import { PrismaService } from '@/database/prisma.service'
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import type { CheckoutOffer, OfferTier, RecurringInterval } from './payments.types'
import { StripeService } from './stripe.service'

class CheckoutOfferDto implements CheckoutOffer {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsIn(['free', 'starter', 'writer', 'pro'])
  tier!: OfferTier

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsIn(['day', 'week', 'month', 'year'])
  interval!: RecurringInterval

  @ValidateIf((offer: CheckoutOfferDto) => !offer.stripePriceId)
  @IsInt()
  @Min(1)
  amountCents?: number

  @IsOptional()
  @IsString()
  stripePriceId?: string

  @IsOptional()
  @IsString()
  currency?: string
}

export class CreateCheckoutSessionDto {
  @ValidateNested()
  @Type(() => CheckoutOfferDto)
  offer!: CheckoutOfferDto

  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  successUrl!: string

  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  cancelUrl!: string
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('checkout-session')
  async createCheckoutSession(
    @Req() req: any,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    const { userId } = req.user as { userId: string }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const offer = dto.offer
    if (!offer.stripePriceId && (!offer.amountCents || offer.amountCents < 1)) {
      throw new BadRequestException(
        'Offer must provide either stripePriceId or amountCents',
      )
    }

    let customerId = user.stripeCustomerId
    if (!customerId) {
      customerId = await this.stripeService.createCustomer(
        user.email,
        user.name,
      )
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      })
    }

    const url = await this.stripeService.createCheckoutSession(
      customerId,
      offer,
      dto.successUrl,
      dto.cancelUrl,
    )

    return { url }
  }
}
