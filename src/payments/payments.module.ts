import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { PaymentsController } from './payments.controller';
import { AppConfigModule } from '../common/config/config.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [StripeController, PaymentsController],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
