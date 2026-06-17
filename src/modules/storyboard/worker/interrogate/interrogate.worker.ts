import { PrismaService } from "@/database/prisma.service";
import { ProviderService } from "@/modules/ai/provider.service";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { StoryboardGateway } from "../../storyboard.gateway";
import { STORYBOARD_INTERROGATE_QUEUE } from "./interrogate.constants";

type InterrogateData = {
  questions: string[];
  body: string;
  minAnswers?: number;
};

interface InterrogateJob {
  storyId: string;
  userId: string;
  data: InterrogateData;
}

@Processor(STORYBOARD_INTERROGATE_QUEUE)
export class StoryboardInterrogateWorker extends WorkerHost {
  private readonly logger = new Logger(StoryboardInterrogateWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: StoryboardGateway,
    private readonly provider: ProviderService,
  ) {
    super();
  }
  private countWords(value: string): number {
    const matches = value.trim().match(/\S+/g);
    return matches?.length ?? 0;
  }

  private userPrompt(draft: string, questions: string[]) {
    return `Analyze this story planner draft and return JSON only.\n\nQuestions to check:\n${questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}\n\nDraft:\n${draft}`;
  }

  private systemPrompt() {
    return `Return strict valid JSON only with this exact shape:\n{\n  "status": [\n    { "question": string, "answered": boolean, "evidence": string }\n  ],\n]\n}\n\nRules:\n- Include one entry for each question in the questions array.\n- Keep extracted arrays concise and deduplicated.\n- Only use details supported by the draft.`;
  }

  async process(job: Job<InterrogateJob>): Promise<void> {
    this.logger.log(`Job: ${STORYBOARD_INTERROGATE_QUEUE}`);

    const { storyId, data } = job.data;

    const userPrompt = this.userPrompt(data.body, data.questions);
    const systemPrompt = this.systemPrompt();

    const raw = await this.provider.complete(userPrompt, systemPrompt);
    const parsed = JSON.parse(raw);

    const thresholdReached =
      parsed.status.filter((v: { answered: boolean }) => !v.answered).length >=
        (data.minAnswers || 0) || false;

    return this.gateway.emitInterrogateComplete(storyId, {
      wordCount: this.countWords(data.body),
      thresholdReached,
      ...parsed,
    });
  }
}
