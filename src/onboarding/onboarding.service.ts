import { InjectQueue } from '@nestjs/bullmq'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Queue } from 'bullmq'
import { ProviderService } from '../ai/provider.service'
import { PrismaService } from '../database/prisma.service'
import { ONBOARDING_GENERATE_QUEUE } from '../queues/queue.constants'
import {
    AnalyzePlannerDraftResponse,
    OnboardingAnswersDto,
    PlannerExtractedCharacter,
    PlannerExtractedLocation,
    PlannerExtractedPlotline,
    PlannerQuestionStatus,
} from './onboarding.dto'

const PLANNER_QUESTIONS = [
  'Who is at the center of this story?',
  'Where does the story take place?',
  'What happens that changes everything?',
  'What does your protagonist want or need?',
  'What stands in the way?',
];

const ANALYSIS_THRESHOLD_WORD_COUNT = 20;

interface PlannerAiResponse {
  questions: PlannerQuestionStatus[];
  extractedCharacters: PlannerExtractedCharacter[];
  extractedLocations: PlannerExtractedLocation[];
  extractedPlotlines: PlannerExtractedPlotline[];
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectQueue(ONBOARDING_GENERATE_QUEUE)
    private readonly onboardingQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
  ) {}

  private countWords(input: string): number {
    const tokens = input.trim().match(/\S+/g);
    return tokens?.length ?? 0;
  }

  private parseAiResponse(raw: string): PlannerAiResponse {
    const trimmed = raw.trim();
    const withoutFence = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const tryParse = (value: string): PlannerAiResponse => {
      return JSON.parse(value) as PlannerAiResponse;
    };

    try {
      return tryParse(withoutFence);
    } catch {
      const start = withoutFence.indexOf('{');
      const end = withoutFence.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return tryParse(withoutFence.slice(start, end + 1));
      }

      throw new Error('Invalid planner analysis response');
    }
  }

  private sanitizeQuestionStatus(items: PlannerQuestionStatus[]): PlannerQuestionStatus[] {
    const statusMap = new Map<string, PlannerQuestionStatus>();
    for (const question of PLANNER_QUESTIONS) {
      statusMap.set(question, { question, answered: false });
    }

    for (const item of items ?? []) {
      if (!item?.question || !statusMap.has(item.question)) {
        continue;
      }

      statusMap.set(item.question, {
        question: item.question,
        answered: Boolean(item.answered),
        evidence: typeof item.evidence === 'string' ? item.evidence.trim() : undefined,
      });
    }

    return PLANNER_QUESTIONS.map((question) => statusMap.get(question)!);
  }

  private sanitizeCharacters(items: PlannerExtractedCharacter[]): PlannerExtractedCharacter[] {
    return (items ?? [])
      .filter((item) => typeof item?.name === 'string' && item.name.trim().length > 0)
      .map((item) => ({
        name: item.name.trim(),
        description: typeof item.description === 'string' ? item.description.trim() : '',
      }))
      .slice(0, 8);
  }

  private sanitizeLocations(items: PlannerExtractedLocation[]): PlannerExtractedLocation[] {
    return (items ?? [])
      .filter((item) => typeof item?.name === 'string' && item.name.trim().length > 0)
      .map((item) => ({
        name: item.name.trim(),
        description: typeof item.description === 'string' ? item.description.trim() : '',
      }))
      .slice(0, 8);
  }

  private sanitizePlotlines(items: PlannerExtractedPlotline[]): PlannerExtractedPlotline[] {
    return (items ?? [])
      .filter((item) => typeof item?.title === 'string' && item.title.trim().length > 0)
      .map((item) => ({
        title: item.title.trim(),
        note: typeof item.note === 'string' ? item.note.trim() : '',
      }))
      .slice(0, 10);
  }

  async enqueue(storyId: string, userId: string, answers: OnboardingAnswersDto) {
    await this.onboardingQueue.add(ONBOARDING_GENERATE_QUEUE, {
      storyId,
      userId,
      answers,
    });

    return { accepted: true };
  }

  async analyzeDraft(
    storyId: string,
    userId: string,
    draft: string,
  ): Promise<AnalyzePlannerDraftResponse> {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }

    const wordCount = this.countWords(draft);
    if (wordCount < ANALYSIS_THRESHOLD_WORD_COUNT) {
      return {
        wordCount,
        thresholdWordCount: ANALYSIS_THRESHOLD_WORD_COUNT,
        thresholdReached: false,
        answeredCount: 0,
        thresholdMet: false,
        questions: PLANNER_QUESTIONS.map((question) => ({ question, answered: false })),
        extractedCharacters: [],
        extractedLocations: [],
        extractedPlotlines: [],
      };
    }

    const userPrompt = `Analyze this story planner draft and return JSON only.\n\nQuestions to check:\n${PLANNER_QUESTIONS.map((question, index) => `${index + 1}. ${question}`).join('\n')}\n\nDraft:\n${draft}`;

    const systemPrompt = `Return strict valid JSON only with this exact shape:\n{\n  "questions": [\n    { "question": string, "answered": boolean, "evidence": string }\n  ],\n  "extractedCharacters": [\n    { "name": string, "description": string }\n  ],\n  "extractedLocations": [\n    { "name": string, "description": string }\n  ],\n  "extractedPlotlines": [\n    { "title": string, "note": string }\n  ]\n}\n\nRules:\n- Include one entry for each planner question in the questions array.\n- Keep extracted arrays concise and deduplicated.\n- Only use details supported by the draft.`;

    const raw = await this.provider.complete(userPrompt, systemPrompt);
    const parsed = this.parseAiResponse(raw);

    const questions = this.sanitizeQuestionStatus(parsed.questions);
    const answeredCount = questions.filter((item) => item.answered).length;

    return {
      wordCount,
      thresholdWordCount: ANALYSIS_THRESHOLD_WORD_COUNT,
      thresholdReached: true,
      answeredCount,
      thresholdMet: answeredCount >= 3,
      questions,
      extractedCharacters: this.sanitizeCharacters(parsed.extractedCharacters),
      extractedLocations: this.sanitizeLocations(parsed.extractedLocations),
      extractedPlotlines: this.sanitizePlotlines(parsed.extractedPlotlines),
    };
  }
}
