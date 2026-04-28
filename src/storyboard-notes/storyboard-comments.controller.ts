import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import {
    CreateStoryboardCommentDto,
    ListStoryboardCommentsQueryDto,
    UpdateStoryboardCommentDto,
} from './storyboard-comments.dto'
import { StoryboardCommentsService } from './storyboard-comments.service'

@Controller()
export class StoryboardCommentsController {
  constructor(private readonly storyboardCommentsService: StoryboardCommentsService) {}

  @Get('stories/:storyId/comments')
  list(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Query() query: ListStoryboardCommentsQueryDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.list(storyId, userId, query);
  }

  @Post('stories/:storyId/comments')
  create(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: CreateStoryboardCommentDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.create(storyId, userId, dto);
  }

  @Patch('stories/:storyId/comments/:commentId')
  update(
    @Param('storyId') storyId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
    @Body() dto: UpdateStoryboardCommentDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.update(storyId, commentId, userId, dto);
  }

  @Delete('stories/:storyId/comments/:commentId')
  remove(
    @Param('storyId') storyId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.remove(storyId, commentId, userId);
  }

  @Post('stories/:storyId/comments/:commentId/resolve')
  resolve(
    @Param('storyId') storyId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.resolve(storyId, commentId, userId);
  }

  @Post('stories/:storyId/comments/:commentId/reopen')
  reopen(
    @Param('storyId') storyId: string,
    @Param('commentId') commentId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storyboardCommentsService.reopen(storyId, commentId, userId);
  }
}
