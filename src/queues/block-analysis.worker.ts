import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Job } from 'bullmq'
import { BlockAnalyzerService, ReferenceOccurrenceInput } from '../ai/block-analyzer.service'
import { PrismaService } from '../database/prisma.service'
import { EVENT_GROUP, EVENT_TYPE } from '../events/event.constants'
import { EventsService } from '../events/events.service'
import { ProgressGateway } from '../gateway/progress.gateway'
import { ThreadsService } from '../threads/threads.service'
import { BLOCK_ANALYSIS_QUEUE } from './queue.constants'

interface BlockAnalysisJob {
  blockId: string;
  storyId: string;
}

const MIN_INFERRED_CONFIDENCE = 0.65;

type BlockAnalysisDiagnostics = {
  reason:
    | 'success'
    | 'no_reference_occurrences'
    | 'references_below_threshold'
    | 'analyzer_returned_empty'
    | 'threads_filtered_by_confidence';
  totalOccurrences: number;
  explicitOccurrences: number;
  inferredOccurrences: number;
  selectedOccurrences: number;
  extractionCount: number;
  minInferredConfidence: number;
};

@Processor(BLOCK_ANALYSIS_QUEUE)
export class BlockAnalysisWorker extends WorkerHost {
  private readonly logger = new Logger(BlockAnalysisWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockAnalyzer: BlockAnalyzerService,
    private readonly threadsService: ThreadsService,
    private readonly gateway: ProgressGateway,
    private readonly events: EventsService,
  ) {
    super();
  }

  private async setBlockStatusSafely(blockId: string, status: 'analyzing' | 'analyzed' | 'failed'): Promise<boolean> {
    try {
      await this.prisma.block.update({
        where: { id: blockId },
        data: { status },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        this.logger.warn(`Block ${blockId} missing while setting status ${status}; skipping status update`);
        return false;
      }

      throw error;
    }
  }

  async process(job: Job<BlockAnalysisJob>): Promise<void> {
    const { blockId, storyId } = job.data;
    this.logger.log(`Analyzing block ${blockId}`);

    // Mark block as analyzing
    const markedAnalyzing = await this.setBlockStatusSafely(blockId, 'analyzing');
    if (!markedAnalyzing) {
      return;
    }

    try {
      // Fetch block with content
      const block = await this.prisma.block.findUnique({ where: { id: blockId } });
      if (!block) {
        this.logger.warn(`Block ${blockId} not found — skipping`);
        return;
      }

      // Fetch all characters and locations for this story
      const [characters, locations] = await Promise.all([
        this.prisma.character.findMany({ where: { storyId } }),
        this.prisma.location.findMany({ where: { storyId } }),
      ]);

      const occurrenceRows = await this.prisma.referenceOccurrence.findMany({
        where: { storyId, blockId },
        select: {
          entityId: true,
          entityType: true,
          text: true,
          source: true,
          confidence: true,
        },
      });

      const explicitOccurrences = occurrenceRows.filter((row) => row.source === 'explicit').length;
      const inferredOccurrences = occurrenceRows.length - explicitOccurrences;

      const bestOccurrenceByEntity = new Map<string, ReferenceOccurrenceInput>();
      for (const row of occurrenceRows) {
        const candidate: ReferenceOccurrenceInput = {
          entityId: row.entityId,
          entityType: row.entityType as 'character' | 'location',
          text: row.text,
          source: row.source === 'explicit' ? 'explicit' : 'inferred',
          confidence: row.confidence,
        };

        const key = `${candidate.entityType}:${candidate.entityId}`;
        const existing = bestOccurrenceByEntity.get(key);
        const existingPriority = existing
          ? existing.source === 'explicit'
            ? 10 + existing.confidence
            : existing.confidence
          : -1;
        const candidatePriority = candidate.source === 'explicit' ? 10 + candidate.confidence : candidate.confidence;

        if (!existing || candidatePriority > existingPriority) {
          bestOccurrenceByEntity.set(key, candidate);
        }
      }

      const selectedOccurrences = [...bestOccurrenceByEntity.values()].filter(
        (occurrence) =>
          occurrence.source === 'explicit' || occurrence.confidence >= MIN_INFERRED_CONFIDENCE,
      );

      const entityContexts = [
        ...characters.map((c) => ({
          id: c.id,
          type: 'character' as const,
          name: c.name,
          superObjective: c.superObjective,
          coreFear: c.coreFear,
          aliases: (c.aliases ?? []) as Array<{ text: string; context?: string }>,
        })),
        ...locations.map((l) => ({
          id: l.id,
          type: 'location' as const,
          name: l.name,
        })),
      ];

      // Extract threads from block
      const extractions = await this.blockAnalyzer.analyze(
        block.content,
        block.contentJSON as Record<string, unknown>,
        entityContexts,
        block.order,
        selectedOccurrences,
      );

      // Clear old threads for this block before upserting (idempotent re-analysis)
      await this.threadsService.deleteByBlock(blockId);

      // Upsert new threads
      let threadsCreated = 0;
      for (const extraction of extractions) {
        if (
          extraction.referenceSource !== 'explicit' &&
          (extraction.referenceConfidence ?? 0) < MIN_INFERRED_CONFIDENCE
        ) {
          continue;
        }

        await this.threadsService.upsert(blockId, extraction.entityId, {
          storyId,
          passageId: block.passageId ?? null,
          entityType: extraction.entityType,
          blockOrder: block.order,
          observation: extraction.observation,
          interactions: extraction.interactions,
          emotionalTone: extraction.emotionalTone ?? undefined,
          superObjAlign: extraction.superObjAlign ?? undefined,
        });
        threadsCreated++;
      }

      const diagnostics: BlockAnalysisDiagnostics = {
        reason: 'success',
        totalOccurrences: occurrenceRows.length,
        explicitOccurrences,
        inferredOccurrences,
        selectedOccurrences: selectedOccurrences.length,
        extractionCount: extractions.length,
        minInferredConfidence: MIN_INFERRED_CONFIDENCE,
      };

      if (occurrenceRows.length === 0) {
        diagnostics.reason = 'no_reference_occurrences';
      } else if (selectedOccurrences.length === 0) {
        diagnostics.reason = 'references_below_threshold';
      } else if (extractions.length === 0) {
        diagnostics.reason = 'analyzer_returned_empty';
      } else if (threadsCreated === 0) {
        diagnostics.reason = 'threads_filtered_by_confidence';
      }

      // Mark block as analyzed
      await this.setBlockStatusSafely(blockId, 'analyzed');

      // Emit WebSocket event to frontend queue drainer
      this.gateway.emitBlockAnalyzed(storyId, blockId, threadsCreated, diagnostics);
      this.logger.log(`Block ${blockId} analyzed — ${threadsCreated} threads created`);

      this.events.record({
        eventType: EVENT_TYPE.BLOCK_ANALYSIS_COMPLETED,
        eventGroup: EVENT_GROUP.BLOCK_ANALYSIS,
        source: BlockAnalysisWorker.name,
        status: 'success',
        storyId,
        metadata: { blockId, threadsCreated, ...diagnostics },
      });
    } catch (err) {
      this.logger.error(`Block ${blockId} analysis failed: ${err}`);
      await this.setBlockStatusSafely(blockId, 'failed');
      this.events.record({
        eventType: EVENT_TYPE.BLOCK_ANALYSIS_FAILED,
        eventGroup: EVENT_GROUP.BLOCK_ANALYSIS,
        source: BlockAnalysisWorker.name,
        status: 'error',
        storyId,
        metadata: { blockId, error: String(err) },
      });
      throw err;
    }
  }
}
