import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { DatabaseModule } from '../database/database.module';
import { PassagesModule } from '../passages/passages.module';

@Module({
  imports: [DatabaseModule, PassagesModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}
