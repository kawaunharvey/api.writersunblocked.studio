import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { AppConfigService } from '../common/config/app-config.service'
import { DREAM_THREAD_GENERATE_QUEUE } from '../queues/queue.constants'

@Injectable()
export class DreamThreadJobsService {
  private readonly redis: Redis;

  constructor(
    private readonly config: AppConfigService,
    @InjectQueue(DREAM_THREAD_GENERATE_QUEUE)
    private readonly queue: Queue,
  ) {
    this.redis = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    });
  }

  debounceKey(storyId: string) {
    return `dt-debounce:${storyId}`;
  }

  async enqueueDebounced(storyId: string): Promise<boolean> {
    const key = this.debounceKey(storyId);
    const exists = await this.redis.exists(key);
    if (exists) {
      return false;
    }

    await this.redis.set(key, '1', 'EX', 5);
    await this.queue.add(DREAM_THREAD_GENERATE_QUEUE, { storyId });
    return true;
  }
}
