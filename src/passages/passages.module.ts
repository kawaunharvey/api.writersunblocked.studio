import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PassagesController } from './passages.controller';
import { PassagesService } from './passages.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PassagesController],
  providers: [PassagesService],
  exports: [PassagesService],
})
export class PassagesModule {}
