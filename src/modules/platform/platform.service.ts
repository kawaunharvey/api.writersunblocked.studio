import { PrismaService } from "@/database/prisma.service";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProviderService } from "../ai/provider.service";
import { loadPlatformStoryContext } from "./platform.context";
import { PLATFORM_MIN_WORDS } from "./platform.defaults";
import { parseExtractionResponse } from "./platform.parse";
import { buildSystemPrompt, buildUserPrompt } from "./platform.prompt";
import type { PlatformActionResponse } from "./platform.types";
import { sanitizePlatformTransformation } from "./platform.transform";
import { countWords } from "./platform.utils";

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
  ) {}

  async translateToPlatform(
    storyId: string,
    userId: string,
    text: string,
  ): Promise<{
    wordCount: number;
    thresholdWordCount: number;
    thresholdReached: boolean;
    answeredCount: number;
    thresholdMet: boolean;
    translation: PlatformActionResponse | null;
  }> {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw new NotFoundException("Story not found");
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    const wordCount = countWords(text);
    if (wordCount < PLATFORM_MIN_WORDS) {
      return {
        wordCount,
        thresholdWordCount: PLATFORM_MIN_WORDS,
        thresholdReached: false,
        answeredCount: 0,
        thresholdMet: false,
        translation: null,
      };
    }

    const context = await loadPlatformStoryContext(this.prisma, storyId);
    const userPrompt = buildUserPrompt(text, context);
    const systemPrompt = buildSystemPrompt();

    const raw = await this.provider.complete(userPrompt, systemPrompt);
    const extraction = parseExtractionResponse(raw);
    const translation = await sanitizePlatformTransformation(
      extraction,
      context,
      wordCount,
    );

    return {
      wordCount,
      thresholdWordCount: PLATFORM_MIN_WORDS,
      thresholdReached: false,
      answeredCount: 0,
      thresholdMet: false,
      translation,
    };
  }
}
