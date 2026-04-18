import { Module } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CharactersController, LocationsController],
  providers: [CharactersService, LocationsService],
  exports: [CharactersService, LocationsService],
})
export class EntitiesModule {}
