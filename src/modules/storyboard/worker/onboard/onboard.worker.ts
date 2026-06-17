import { PrismaService } from "@/database/prisma.service";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import moment from "moment";
import { StoryboardGateway } from "../../storyboard.gateway";
import { STORYBOARD_ONBOARD_QUEUE } from "./onboard.constants";
import { OnboardToPlatform } from "./onboard.dto";

interface OnboardingJob {
  storyId: string;
  userId: string;
  data: OnboardToPlatform;
}

@Processor(STORYBOARD_ONBOARD_QUEUE)
export class StoryboardOnboardingWorker extends WorkerHost {
  private readonly logger = new Logger(StoryboardOnboardingWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: StoryboardGateway,
  ) {
    super();
  }

  async process(job: Job<OnboardingJob>): Promise<void> {
    this.logger.log(`Job: ${STORYBOARD_ONBOARD_QUEUE}`);

    const {
      storyId,
      data: { mentions, notes, scenes },
      userId,
    } = job.data;

    if (mentions && mentions?.length > 0) {
      this.prisma.mention.createMany({
        data: mentions.map((mention) => ({
          name: mention.name,
          userId,
          mentionType: mention.mentionType,
          storyId,
        })),
      });
    }

    if (notes && notes?.length > 0) {
      this.prisma.note.createMany({
        data: notes,
      });
    }

    if (scenes && scenes?.length > 0) {
      this.prisma.scene.createMany({
        data: scenes.map((scene) => ({
          ...scene,
          chapters: [],
        })),
      });
    }

    await this.prisma.story.update({
      where: { id: storyId },
      data: { onboardingComplete: true, updatedAt: moment().toISOString() },
    });
    return this.gateway.emitOnboardComplete(storyId);
  }
}
