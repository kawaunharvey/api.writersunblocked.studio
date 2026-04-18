import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BlockAnalysisWorker } from './block-analysis.worker';
import { BLOCK_ANALYSIS_QUEUE } from './queue.constants';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { ThreadsModule } from '../threads/threads.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: BLOCK_ANALYSIS_QUEUE }),
    AiModule,
    DatabaseModule,
    ThreadsModule,
    GatewayModule,
  ],
  providers: [BlockAnalysisWorker],
})
export class WorkerModule {}
