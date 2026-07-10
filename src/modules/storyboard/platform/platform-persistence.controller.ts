import { CurrentUser } from '@/decorators/current-user.decorator';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlatformApplyService } from './platform-apply.service';
import {
  CreatePlatformPostDto,
  RejectPlatformItemDto,
} from './platform-persistence.dto';
import { PlatformPersistenceService } from './platform-persistence.service';

@Controller('stories/:storyId/platform')
export class PlatformPersistenceController {
  constructor(
    private readonly persistenceService: PlatformPersistenceService,
    private readonly applyService: PlatformApplyService,
  ) {}

  @Get('posts')
  listPosts(
    @Param('storyId') storyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.persistenceService.listPosts(storyId, userId);
  }

  @Post('posts')
  createPost(
    @Param('storyId') storyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePlatformPostDto,
  ) {
    return this.persistenceService.createPost(storyId, userId, dto);
  }

  @Post('items/:itemId/apply')
  applyItem(
    @Param('storyId') storyId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.applyService.applyItem(storyId, userId, itemId);
  }

  @Post('items/:itemId/reject')
  rejectItem(
    @Param('storyId') storyId: string,
    @Param('itemId') itemId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: RejectPlatformItemDto,
  ) {
    return this.applyService.rejectItem(storyId, userId, itemId, dto.reason);
  }
}
