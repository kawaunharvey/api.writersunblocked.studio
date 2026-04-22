import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AppConfigModule } from '../common/config/config.module'
import { DatabaseModule } from '../database/database.module'
import { DreamThreadGeneratorWorker } from '../dream-threads/dream-thread-generator.worker'
import { DreamThreadsModule } from '../dream-threads/dream-threads.module'
import { GatewayModule } from '../gateway/gateway.module'
import { OnboardingWorker } from '../onboarding/onboarding.worker'
import { ThreadsModule } from '../threads/threads.module'
import { BlockAnalysisWorker } from './block-analysis.worker'
import {
    BLOCK_ANALYSIS_QUEUE,
    DREAM_THREAD_GENERATE_QUEUE,
    ONBOARDING_GENERATE_QUEUE,
} from './queue.constants'

@Module({
  imports: [
    BullModule.registerQueue(
      { name: BLOCK_ANALYSIS_QUEUE },
      { name: DREAM_THREAD_GENERATE_QUEUE },
      { name: ONBOARDING_GENERATE_QUEUE },
    ),
    AppConfigModule,
    AiModule,
    DatabaseModule,
    DreamThreadsModule,
    ThreadsModule,
    GatewayModule,
  ],
  providers: [BlockAnalysisWorker, DreamThreadGeneratorWorker, OnboardingWorker],
})
export class WorkerModule {}
