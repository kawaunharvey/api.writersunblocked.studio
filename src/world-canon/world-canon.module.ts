import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { DreamThreadsModule } from '../dream-threads/dream-threads.module'
import { WorldCanonController } from './world-canon.controller'
import { WorldCanonService } from './world-canon.service'

@Module({
  imports: [DatabaseModule, DreamThreadsModule],
  controllers: [WorldCanonController],
  providers: [WorldCanonService],
  exports: [WorldCanonService],
})
export class WorldCanonModule {}
