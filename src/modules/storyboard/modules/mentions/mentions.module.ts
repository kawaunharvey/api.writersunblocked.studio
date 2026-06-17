import { DatabaseModule } from '@/database/database.module'
import { Module } from '@nestjs/common'
import { MentionsController } from './mentions.controller'
import { MentionsService } from './mentions.service'

@Module({
  imports: [DatabaseModule],
  controllers: [MentionsController],
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}
