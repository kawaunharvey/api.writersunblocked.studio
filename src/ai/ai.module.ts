import { Module } from '@nestjs/common';
import { ProviderService } from './provider.service';
import { BlockAnalyzerService } from './block-analyzer.service';
import { SpConstructorService } from './sp-constructor.service';

@Module({
  providers: [ProviderService, BlockAnalyzerService, SpConstructorService],
  exports: [ProviderService, BlockAnalyzerService, SpConstructorService],
})
export class AiModule {}
