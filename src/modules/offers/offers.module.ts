import { AppConfigModule } from '@/common/config/config.module'
import { Module } from '@nestjs/common'
import { OffersController } from './offers.controller'
import { OffersService } from './offers.service'

@Module({
  imports: [AppConfigModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
