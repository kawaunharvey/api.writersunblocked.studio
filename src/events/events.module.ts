import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventRetentionScheduler } from './event-retention.scheduler';

// @Global makes EventsService injectable in all modules without explicit imports.
// DatabaseModule and AppConfigModule are already @Global so EventsService's
// PrismaService and AppConfigService deps resolve automatically.
@Global()
@Module({
  providers: [EventsService, EventRetentionScheduler],
  exports: [EventsService],
})
export class EventsModule {}
