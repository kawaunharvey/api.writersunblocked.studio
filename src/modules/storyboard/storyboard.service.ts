import { PrismaService } from "@/database/prisma.service";
import { InjectQueue } from "@nestjs/bullmq";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import moment from "moment";
import { STORYBOARD_INTERROGATE_QUEUE } from "./worker/interrogate/interrogate.constants";
import { InterrogateQueryDto } from "./worker/interrogate/interrogate.dto";
import { STORYBOARD_ONBOARD_QUEUE } from "./worker/onboard/onboard.constants";
import { OnboardToPlatform } from "./worker/onboard/onboard.dto";
import { STORYBOARD_PLATFORM_QUEUE } from "./worker/platform/platform.constants";
import { TranslateToPlatformDto } from "./worker/platform/platform.dto";

@Injectable()
export class StoryboardService {
  constructor(
    @InjectQueue(STORYBOARD_ONBOARD_QUEUE)
    private readonly onboardingQueue: Queue,
    @InjectQueue(STORYBOARD_PLATFORM_QUEUE)
    private readonly platformQueue: Queue,
    @InjectQueue(STORYBOARD_INTERROGATE_QUEUE)
    private readonly interrogateQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  private async isValid(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) {
      throw new NotFoundException("Story not found");
    }

    return story.userId === userId;
  }

  async onboard(storyId: string, userId: string, dto: OnboardToPlatform) {
    const isValid = await this.isValid(storyId, userId);
    if (!isValid) throw new ForbiddenException();

    const jobId = `${STORYBOARD_ONBOARD_QUEUE}-${userId}`;
    const existing = await this.platformQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "waiting" || state === "delayed" || state === "completed") {
        await existing.remove();
      }
    }

    await this.onboardingQueue.add(
      STORYBOARD_ONBOARD_QUEUE,
      { storyId, userId, data: dto },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );

    return { accepted: true };
  }

  async platform(storyId: string, userId: string, dto: TranslateToPlatformDto) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) {
      throw new NotFoundException("Story not found");
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    const jobId = `${STORYBOARD_PLATFORM_QUEUE}-${userId}`;
    const existing = await this.platformQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "waiting" || state === "delayed" || state === "completed") {
        await existing.remove();
      }
    }

    await this.platformQueue.add(
      STORYBOARD_PLATFORM_QUEUE,
      { storyId, userId, data: dto },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );

    return { accepted: true };
  }

  async interrogate(storyId: string, userId: string, dto: InterrogateQueryDto) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });
    if (!story) {
      throw new NotFoundException("Story not found");
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    const jobId = `${STORYBOARD_INTERROGATE_QUEUE}-${userId}`;
    const existing = await this.interrogateQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "waiting" || state === "delayed" || state === "completed") {
        await existing.remove();
      }
    }

    this.interrogateQueue.add(
      STORYBOARD_INTERROGATE_QUEUE,
      { storyId, userId, data: dto },
      { jobId, removeOnComplete: true, removeOnFail: true },
    );
  }

  async skipOnboarding(storyId: string) {
    return await this.prisma.story.update({
      where: { id: storyId },
      data: { onboardingComplete: true, updatedAt: moment().toISOString() },
    });
  }
}
