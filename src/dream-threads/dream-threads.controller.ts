import { Controller, Get, Param, Req } from '@nestjs/common'
import { StoriesService } from '../stories/stories.service'
import { DreamThreadsService } from './dream-threads.service'

@Controller()
export class DreamThreadsController {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly dreamThreadsService: DreamThreadsService,
  ) {}

  @Get('stories/:storyId/dream-threads')
  async list(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.storiesService.findById(storyId, userId);
    return this.dreamThreadsService.listForStory(storyId);
  }
}
