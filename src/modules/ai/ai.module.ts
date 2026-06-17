import { Module } from '@nestjs/common'
import { ProviderService } from './provider.service'
import { SpConstructorService } from './sp-constructor.service'

@Module({
  providers: [ProviderService, SpConstructorService],
  exports: [ProviderService, SpConstructorService],
})
export class AiModule {}
