import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventsService } from './events.service';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Schedules a daily run of the event retention cleanup.
 * Uses a plain setInterval so no extra dependencies are required.
 * Clears the interval on module teardown for clean graceful shutdown.
 */
@Injectable()
export class EventRetentionScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EventRetentionScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly eventsService: EventsService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.eventsService.pruneOldEvents().catch((err) => {
        this.logger.error(`Retention job failed: ${String(err)}`);
      });
    }, TWENTY_FOUR_HOURS_MS);

    this.logger.log('Event retention scheduler started (runs every 24 h)');
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
