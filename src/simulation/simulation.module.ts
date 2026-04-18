import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { ThreadsModule } from '../threads/threads.module';
import { MomentumService } from './momentum.service';
import { SimulationService } from './simulation.service';

@Module({
  imports: [AiModule, DatabaseModule, ThreadsModule],
  providers: [SimulationService, MomentumService],
  exports: [SimulationService, MomentumService],
})
export class SimulationModule {}
