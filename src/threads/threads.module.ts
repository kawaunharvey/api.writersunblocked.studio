import { Module } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { ThreadsController } from './threads.controller';
import { DatabaseModule } from '../database/database.module';
import { StoriesModule } from '../stories/stories.module';

@Module({
  imports: [DatabaseModule, StoriesModule],
  controllers: [ThreadsController],
  providers: [ThreadsService],
  exports: [ThreadsService],
})
export class ThreadsModule {}
