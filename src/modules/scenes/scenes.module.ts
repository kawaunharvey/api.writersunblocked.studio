import { DatabaseModule } from '@/database/database.module'
import { Module } from '@nestjs/common'
import { ScenesController } from './scenes.controller'
import { ScenesService } from './scenes.service'

@Module({
  imports: [
    DatabaseModule
  ],
  controllers: [ScenesController],
  providers: [ScenesService],
  exports: [ScenesService],
})
export class ScenesModule {}
