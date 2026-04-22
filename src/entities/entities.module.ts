import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { DreamThreadsModule } from '../dream-threads/dream-threads.module'
import { StoriesModule } from '../stories/stories.module'
import { CharactersController } from './characters.controller'
import { CharactersService } from './characters.service'
import { LocationsController } from './locations.controller'
import { LocationsService } from './locations.service'

@Module({
  imports: [DatabaseModule, StoriesModule, DreamThreadsModule],
  controllers: [CharactersController, LocationsController],
  providers: [CharactersService, LocationsService],
  exports: [CharactersService, LocationsService],
})
export class EntitiesModule {}
