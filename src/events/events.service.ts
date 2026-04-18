import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from '../common/config/app-config.service';
import type { EventGroup, EventType } from './event.constants';

export interface RecordEventInput {
  eventType: EventType;
  eventGroup: EventGroup;
  source: string;
  status: 'success' | 'error' | 'skipped';
  durationMs?: number;
  userId?: string;
  storyId?: string;
  requestId?: string;
  provider?: string;
  model?: string;
  inputUnits?: number;
  outputUnits?: number;
  estimatedCostUsd?: number;
  metadata: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Fire-and-forget event write. Never throws — telemetry must not break product flows.
   */
  record(input: RecordEventInput): void {
    this.writeEvent(input).catch((err) => {
      this.logger.error(`Failed to record event ${input.eventType}: ${err}`);
    });
  }

  private async writeEvent(input: RecordEventInput): Promise<void> {
    await this.prisma.appEvent.create({
      data: {
        eventType: input.eventType,
        eventGroup: input.eventGroup,
        source: input.source,
        status: input.status,
        durationMs: input.durationMs,
        userId: input.userId,
        storyId: input.storyId,
        requestId: input.requestId,
        provider: input.provider,
        model: input.model,
        inputUnits: input.inputUnits,
        outputUnits: input.outputUnits,
        estimatedCostUsd: input.estimatedCostUsd,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  // ── Reporting ────────────────────────────────────────────────────────────────

  /**
   * AI call volume and usage grouped by provider + model over a date window.
   */
  async getAiUsageSummary(since: Date): Promise<
    Array<{
      provider: string | null;
      model: string | null;
      total: number;
      errors: number;
      inputUnits: number;
      outputUnits: number;
      estimatedCostUsd: number;
    }>
  > {
    const rows = await this.prisma.appEvent.findMany({
      where: {
        eventGroup: 'ai',
        eventType: 'ai.call.completed',
        occurredAt: { gte: since },
      },
      select: {
        provider: true,
        model: true,
        status: true,
        inputUnits: true,
        outputUnits: true,
        estimatedCostUsd: true,
      },
    });

    const map = new Map<
      string,
      { provider: string | null; model: string | null; total: number; errors: number; inputUnits: number; outputUnits: number; estimatedCostUsd: number }
    >();

    for (const row of rows) {
      const key = `${row.provider ?? ''}:${row.model ?? ''}`;
      const entry = map.get(key) ?? {
        provider: row.provider,
        model: row.model,
        total: 0,
        errors: 0,
        inputUnits: 0,
        outputUnits: 0,
        estimatedCostUsd: 0,
      };
      entry.total += 1;
      if (row.status === 'error') entry.errors += 1;
      entry.inputUnits += row.inputUnits ?? 0;
      entry.outputUnits += row.outputUnits ?? 0;
      entry.estimatedCostUsd += row.estimatedCostUsd ?? 0;
      map.set(key, entry);
    }

    return [...map.values()];
  }

  /**
   * Per-user AI call count for a calendar month (defaults to current month).
   */
  async getUserMonthlyUsage(year: number, month: number): Promise<Array<{ userId: string; callCount: number }>> {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);

    const rows = await this.prisma.appEvent.findMany({
      where: {
        eventGroup: 'ai',
        eventType: 'ai.call.completed',
        occurredAt: { gte: from, lt: to },
        userId: { not: null },
      },
      select: { userId: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.userId) continue;
      counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
    }

    return [...counts.entries()].map(([userId, callCount]) => ({ userId, callCount }));
  }

  /**
   * Per-story block analysis call volume.
   */
  async getStoryAnalysisVolume(since: Date): Promise<Array<{ storyId: string; callCount: number }>> {
    const rows = await this.prisma.appEvent.findMany({
      where: {
        eventGroup: 'block_analysis',
        eventType: 'block.analysis.completed',
        occurredAt: { gte: since },
        storyId: { not: null },
      },
      select: { storyId: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.storyId) continue;
      counts.set(row.storyId, (counts.get(row.storyId) ?? 0) + 1);
    }

    return [...counts.entries()].map(([storyId, callCount]) => ({ storyId, callCount }));
  }

  // ── Retention ────────────────────────────────────────────────────────────────

  /**
   * Delete events older than the configured retention window.
   * Called by the retention job on a schedule. Batched to avoid large deletes.
   */
  async pruneOldEvents(dryRun = false): Promise<{ deleted: number }> {
    const retentionDays = this.config.eventRetentionDays;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const BATCH_SIZE = 500;
    let deleted = 0;

    while (true) {
      const candidates = await this.prisma.appEvent.findMany({
        where: { occurredAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (candidates.length === 0) break;

      if (!dryRun) {
        const ids = candidates.map((c) => c.id);
        const result = await this.prisma.appEvent.deleteMany({
          where: { id: { in: ids } },
        });
        deleted += result.count;
      } else {
        deleted += candidates.length;
      }

      if (candidates.length < BATCH_SIZE) break;
    }

    this.logger.log(`Event retention${dryRun ? ' (dry-run)' : ''}: ${deleted} records ${dryRun ? 'eligible' : 'deleted'} (cutoff: ${cutoff.toISOString()})`);
    return { deleted };
  }
}
