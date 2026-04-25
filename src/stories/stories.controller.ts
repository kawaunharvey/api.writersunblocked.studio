import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    Patch,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common'
import { Public } from '../auth/public.decorator'
import { AppConfigService } from '../common/config/app-config.service'
import {
    CreateStoryDto,
    RebuildReferencesDto,
    UpdatePassageContentDto,
    UpdateStoryDto,
} from './stories.dto'
import { StoriesService } from './stories.service'

@Controller()
export class StoriesController {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly config: AppConfigService,
  ) {}

  @Get('stories')
      list(@Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.listForUser(userId);
  }

  @Post('stories')
      create(@Req() req: any, @Body() dto: CreateStoryDto) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.create(userId, dto.title, dto.penName, dto.mode);
  }

  @Get('stories/:id')
      findOne(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.findById(id, userId);
  }

  @Patch('stories/:id')
      update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateStoryDto) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.update(id, userId, dto);
  }

  @Patch('stories/:storyId/passages/:passageId/content')
      updatePassageContent(
    @Param('storyId') storyId: string,
    @Param('passageId') passageId: string,
    @Req() req: any,
    @Body() dto: UpdatePassageContentDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.updatePassageContent(storyId, userId, passageId, dto);
  }

  @Delete('stories/:id')
  @HttpCode(204)
      async remove(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.storiesService.delete(id, userId);
  }

  @Get('stories/:id/blocks')
  getBlocks(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.getBlocks(id, userId);
  }

  @Get('stories/:id/references')
  getReferences(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.getReferences(id, userId);
  }

  @Post('admin/references/rebuild')
  @Public()
  rebuildReferences(
    @Headers('x-internal-api-secret') providedSecret: string | undefined,
    @Body() dto: RebuildReferencesDto,
  ) {
    if (!providedSecret || providedSecret !== this.config.internalApiSecret) {
      throw new UnauthorizedException('Invalid internal API secret');
    }

    return this.storiesService.rebuildReferences(dto.storyId);
  }
}
