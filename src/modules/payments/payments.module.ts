import { AppConfigModule } from '@/common/config/config.module'
import { DatabaseModule } from '@/database/database.module'
import { OffersModule } from '@/modules/offers/offers.module'
import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { StripeController } from './stripe.controller'
import { StripeService } from './stripe.service'

@Module({
  imports: [AppConfigModule, DatabaseModule, OffersModule],
  controllers: [StripeController, PaymentsController],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
