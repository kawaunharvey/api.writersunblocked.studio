import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AppConfigModule } from '../common/config/config.module'
import { DatabaseModule } from '../database/database.module'
import { DREAM_THREAD_GENERATE_QUEUE } from '../queues/queue.constants'
import { StoriesModule } from '../stories/stories.module'
import { DreamThreadJobsService } from './dream-thread-jobs.service'
import { DreamThreadsController } from './dream-threads.controller'
import { DreamThreadsService } from './dream-threads.service'

@Module({
  imports: [
    DatabaseModule,
    StoriesModule,
    AppConfigModule,
    BullModule.registerQueue({ name: DREAM_THREAD_GENERATE_QUEUE }),
  ],
  controllers: [DreamThreadsController],
  providers: [DreamThreadsService, DreamThreadJobsService],
  exports: [DreamThreadsService, DreamThreadJobsService],
})
export class DreamThreadsModule {}
