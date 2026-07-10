import { PrismaService } from "@/database/prisma.service";
import { ProviderService } from "@/modules/ai/provider.service";
import { loadPlatformStoryContext } from "@/modules/platform/platform.context";
import { PLATFORM_MIN_WORDS } from "@/modules/platform/platform.defaults";
import { parseExtractionResponse } from "@/modules/platform/platform.parse";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "@/modules/platform/platform.prompt";
import { sanitizePlatformTransformation } from "@/modules/platform/platform.transform";
import { countWords } from "@/modules/platform/platform.utils";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { PlatformStatus } from "@prisma/client";
import { Job } from "bullmq";
import { StoryboardGateway } from "../../storyboard.gateway";
import type { PlatformItemResponse } from "../../storyboard.types";
import { PlatformPersistenceService } from "../../platform/platform-persistence.service";
import { STORYBOARD_PLATFORM_QUEUE } from "./platform.constants";
import { TranslateToPlatformDto } from "./platform.dto";

interface PlatformJob {
  storyId: string;
  userId: string;
  postId?: string;
  data: TranslateToPlatformDto;
}

@Processor(STORYBOARD_PLATFORM_QUEUE)
export class StoryboardPlatformWorker extends WorkerHost {
  private readonly logger = new Logger(StoryboardPlatformWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: StoryboardGateway,
    private readonly provider: ProviderService,
    private readonly persistenceService: PlatformPersistenceService,
  ) {
    super();
  }

  async process(job: Job<PlatformJob>): Promise<void> {
    this.logger.log(`Job: ${job.id}`);
    const { storyId, data, postId } = job.data;

    const wordCount = countWords(data.body);

    if (wordCount < PLATFORM_MIN_WORDS) {
      return this.gateway.emitPlatformComplete(storyId, {
        postId,
        wordCount,
        thresholdWordCount: PLATFORM_MIN_WORDS,
        thresholdReached: false,
        answeredCount: 0,
        thresholdMet: false,
        translation: null,
        items: [],
      });
    }

    const context = await loadPlatformStoryContext(this.prisma, storyId);
    const userPrompt = buildUserPrompt(data.body, context);
    const systemPrompt = buildSystemPrompt();

    const raw = await this.provider.complete(userPrompt, systemPrompt);
    const extraction = parseExtractionResponse(raw);
    const translation = await sanitizePlatformTransformation(
      extraction,
      context,
      wordCount,
    );

    let items: PlatformItemResponse[] = [];

    if (postId && translation?.actions?.length) {
      const createdItems = await Promise.all(
        translation.actions.map((actionItem) =>
          this.prisma.platformItem.create({
            data: {
              storyId,
              postId,
              action: actionItem.action,
              body: actionItem.body,
              status: PlatformStatus.PENDING,
              data: actionItem.data.map((field) => ({
                label: field.label,
                type: field.type,
                value: String(field.value),
              })),
            },
          }),
        ),
      );

      items = createdItems.map((item) => this.persistenceService.mapItem(item));
    }

    return this.gateway.emitPlatformComplete(storyId, {
      postId,
      wordCount,
      thresholdWordCount: PLATFORM_MIN_WORDS,
      thresholdReached: true,
      answeredCount: 0,
      thresholdMet: false,
      translation,
      items,
    });
  }
}
