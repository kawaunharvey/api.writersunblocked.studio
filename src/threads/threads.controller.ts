import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { StoriesService } from '../stories/stories.service';

@Controller()
export class ThreadsController {
  constructor(
    private readonly threadsService: ThreadsService,
    private readonly storiesService: StoriesService,
  ) {}

  @Get('stories/:storyId/threads')
  async list(
    @Param('storyId') storyId: string,
    @Query('entityId') entityId: string | undefined,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.storiesService.findById(storyId, userId);
    return this.threadsService.findForStory(storyId, entityId);
  }
}
