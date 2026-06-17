import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
} from '@nestjs/common'
import {
    ConfirmMentionDto,
    CreateMentionDto,
    mentionStatuses,
    mentionTypes,
    UpdateMentionDto,
    type MentionStatus,
    type MentionType,
} from './mentions.dto'
import { MentionsService } from './mentions.service'

@Controller()
export class MentionsController {
  constructor(private readonly mentionsService: MentionsService) {}

  @Get('stories/:storyId/mentions')
  list(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Query('mentionType') mentionType?: string,
    @Query('status') status?: string,
  ) {
    const { userId } = req.user as { userId: string };
    const typedMentionType = mentionTypes.includes(mentionType as MentionType)
      ? (mentionType as MentionType)
      : undefined;

    const typedStatus = mentionStatuses.includes(status as MentionStatus)
      ? (status as MentionStatus)
      : undefined;

    return this.mentionsService.list(storyId, userId, {
      mentionType: typedMentionType,
      status: typedStatus,
    });
  }

  @Post('stories/:storyId/mentions')
  create(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: CreateMentionDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.mentionsService.create(storyId, userId, dto);
  }

  @Patch('mentions/:id')
  update(
    @Param('id') mentionId: string,
    @Req() req: any,
    @Body() dto: UpdateMentionDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.mentionsService.update(mentionId, userId, dto);
  }

  @Post('mentions/:id/confirm')
  confirm(
    @Param('id') mentionId: string,
    @Req() req: any,
    @Body() dto: ConfirmMentionDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.mentionsService.confirm(mentionId, userId, dto);
  }

  @Delete('mentions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') mentionId: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    await this.mentionsService.delete(mentionId, userId);
  }
}
