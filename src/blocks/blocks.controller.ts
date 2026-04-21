import { InjectQueue } from '@nestjs/bullmq'
import {
    Body,
    Controller,
    Delete,
    HttpCode,
    Param,
    Patch,
    Post,
    Req
} from '@nestjs/common'
import { Queue } from 'bullmq'
import { EVENT_GROUP, EVENT_TYPE } from '../events/event.constants'
import { EventsService } from '../events/events.service'
import { BLOCK_ANALYSIS_QUEUE } from '../queues/queue.constants'
import { CreateBlockDto, UpdateBlockDto } from './blocks.dto'
import { BlocksService } from './blocks.service'

@Controller()
export class BlocksController {
  constructor(
    private readonly blocksService: BlocksService,
    @InjectQueue(BLOCK_ANALYSIS_QUEUE) private readonly blockQueue: Queue,
    private readonly events: EventsService,
  ) {}

  @Post('stories/:storyId/blocks')
  async create(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: CreateBlockDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.blocksService.create(storyId, userId, dto);
  }

  @Patch('blocks/:id')
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateBlockDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.blocksService.update(id, userId, dto);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
      async remove(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.blocksService.delete(id, userId);
  }

  @Post('blocks/:id/analyze')
      async enqueueAnalysis(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    const block = await this.blocksService.enqueueAnalysis(id, userId);
    if (block.shouldQueue) {
      await this.blockQueue.add('analyze-block', { blockId: block.id, storyId: block.storyId });
      this.events.record({
        eventType: EVENT_TYPE.BLOCK_ANALYSIS_QUEUED,
        eventGroup: EVENT_GROUP.BLOCK_ANALYSIS,
        source: BlocksController.name,
        status: 'success',
        userId,
        storyId: block.storyId,
        requestId: (req as any).requestId as string | undefined,
        metadata: { blockId: block.id },
      });
    }
    return {
      queued: Boolean(block.shouldQueue),
      blockId: block.id,
      skipped: Boolean((block as { skipped?: boolean }).skipped),
      skipReason: (block as { skipReason?: string }).skipReason,
      eligibleAt: (block as { eligibleAt?: Date }).eligibleAt,
    };
  }
}
