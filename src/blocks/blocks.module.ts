import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AppConfigModule } from '../common/config/config.module'
import { DatabaseModule } from '../database/database.module'
import { PassagesModule } from '../passages/passages.module'
import { BLOCK_ANALYSIS_QUEUE } from '../queues/queue.constants'
import { AnalysisEligibilityService } from './analysis-eligibility.service'
import { BlocksController } from './blocks.controller'
import { BlocksService } from './blocks.service'

@Module({
  imports: [
    DatabaseModule,
    AppConfigModule,
    PassagesModule,
    BullModule.registerQueue({ name: BLOCK_ANALYSIS_QUEUE }),
  ],
  controllers: [BlocksController],
  providers: [BlocksService, AnalysisEligibilityService],
  exports: [BlocksService],
})
export class BlocksModule {}
