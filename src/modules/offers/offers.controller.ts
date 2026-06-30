import { AppConfigService } from '@/common/config/app-config.service'
import { Public } from '@/modules/auth/public.decorator'
import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import type { Offer, SpecialOffer, SyncOffersResult } from './offers.types'
import { OffersService } from './offers.service'

@Controller('payments')
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly config: AppConfigService,
  ) {}

  @Get('offers')
  async getRegularOffers(): Promise<Offer[]> {
    return this.offersService.getRegularOffers()
  }

  @Get('special-offers')
  async getSpecialOffers(): Promise<SpecialOffer[]> {
    return this.offersService.getSpecialOffers()
  }

  @Get('custom-offers')
  async getCustomOffers(): Promise<Offer[]> {
    return this.offersService.getCustomOffers()
  }

  @Public()
  @Post('offers/sync')
  async syncOffers(
    @Headers('x-internal-api-secret') secret: string | undefined,
  ): Promise<SyncOffersResult> {
    if (!secret || secret !== this.config.internalApiSecret) {
      throw new UnauthorizedException('Invalid internal API secret')
    }

    return this.offersService.syncAndReport()
  }
}
