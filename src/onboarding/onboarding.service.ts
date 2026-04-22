import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { ONBOARDING_GENERATE_QUEUE } from '../queues/queue.constants'
import { OnboardingAnswersDto } from './onboarding.dto'

@Injectable()
export class OnboardingService {
  constructor(
    @InjectQueue(ONBOARDING_GENERATE_QUEUE)
    private readonly onboardingQueue: Queue,
  ) {}

  async enqueue(storyId: string, userId: string, answers: OnboardingAnswersDto) {
    await this.onboardingQueue.add(ONBOARDING_GENERATE_QUEUE, {
      storyId,
      userId,
      answers,
    });

    return { accepted: true };
  }
}
