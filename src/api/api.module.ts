import { Module } from '@nestjs/common';
import { AppConfigModule } from '../common/config/config.module';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { SimulationModule } from '../simulation/simulation.module';
import { SimulationController } from './simulation.controller';
import { WaitlistController } from './waitlist.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, EmailModule, SimulationModule],
  controllers: [SimulationController, WaitlistController],
})
export class ApiModule {}
