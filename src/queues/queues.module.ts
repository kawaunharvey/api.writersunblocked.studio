import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { URL } from 'node:url';
import { AppConfigService } from '../common/config/app-config.service';
import { BLOCK_ANALYSIS_QUEUE } from './queue.constants';

export function redisConnectionFromUrl(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        prefix: 'wuapi',
        connection: redisConnectionFromUrl(config.redisUrl),
      }),
    }),
    BullModule.registerQueue({ name: BLOCK_ANALYSIS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
