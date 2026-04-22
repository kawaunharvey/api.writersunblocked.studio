import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { DatabaseModule } from '../database/database.module'
import { GatewayModule } from '../gateway/gateway.module'
import {
    DREAM_THREAD_GENERATE_QUEUE,
    ONBOARDING_GENERATE_QUEUE,
} from '../queues/queue.constants'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    GatewayModule,
    BullModule.registerQueue(
      { name: ONBOARDING_GENERATE_QUEUE },
      { name: DREAM_THREAD_GENERATE_QUEUE },
    ),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
