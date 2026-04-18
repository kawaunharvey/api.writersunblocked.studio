import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BlocksService } from './blocks.service';
import { BlocksController } from './blocks.controller';
import { DatabaseModule } from '../database/database.module';
import { AppConfigModule } from '../common/config/config.module';
import { BLOCK_ANALYSIS_QUEUE } from '../queues/queue.constants';
import { PassagesModule } from '../passages/passages.module';

@Module({
  imports: [
    DatabaseModule,
    AppConfigModule,
    PassagesModule,
    BullModule.registerQueue({ name: BLOCK_ANALYSIS_QUEUE }),
  ],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
