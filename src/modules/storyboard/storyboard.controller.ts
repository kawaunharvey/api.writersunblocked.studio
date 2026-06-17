import { CurrentUser } from "@/decorators/current-user.decorator";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { MentionsService } from "./modules/mentions/mentions.service";
import { NotesService } from "./modules/notes/notes.service";
import { StoryboardService } from "./storyboard.service";
import { InterrogateQueryDto } from "./worker/interrogate/interrogate.dto";
import { OnboardToPlatform } from "./worker/onboard/onboard.dto";
import { TranslateToPlatformDto } from "./worker/platform/platform.dto";

@Controller("storyboard")
export class StoryboardController {
  constructor(
    private readonly mentionsService: MentionsService,
    private readonly notesService: NotesService,
    private readonly storyboardService: StoryboardService,
  ) {}

  @Post(":storyId/onboard")
  async onboard(
    @Param("storyId") storyId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: OnboardToPlatform,
  ) {
    return this.storyboardService.onboard(storyId, userId, dto);
  }

  @Post(":storyId/platform")
  async platform(
    @Param("storyId") storyId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: TranslateToPlatformDto,
  ) {
    return this.storyboardService.platform(storyId, userId, dto);
  }

  @Post(":storyId/interrogate")
  async interrogate(
    @Param("storyId") storyId: string,
    @CurrentUser("userId") userId: string,
    @Body() dto: InterrogateQueryDto,
  ) {
    return this.storyboardService.interrogate(storyId, userId, dto);
  }

  @Get(":storyId/skip-onboarding")
  async skipOnboarding(@Param("storyId") storyId: string) {
    return this.storyboardService.skipOnboarding(storyId);
  }

  // @Get(":storyId/mention")
  // async listMentions(
  //   @CurrentUser("userId") userId: string,
  //   @Param("storyId") storyId: string,
  // ) {
  //   return this.mentionsService.list(storyId, userId);
  // }

  // @Get(":storyId/mention/:mentionId")
  // async getMention(
  //   @Param("storyId") storyId: string,
  //   @Param("mentionId") mentionId: string,
  // ) {
  //   return this.mentionsService.getById(storyId, mentionId);
  // }

  // @Post(":storyId/mention")
  // async newMention(
  //   @Param("storyId") storyId: string,
  //   @CurrentUser("userId") userId: string,
  //   @Body() dto: CreateMentionDto,
  // ) {
  //   return this.mentionsService.create(storyId, userId, dto);
  // }

  // // todo Patch request for mention
  // // todo Delete request for mention

  // // Plot Points
  // @Post(":storyId/plot-point")
  // async newPlotPoint(
  //   @Param("storyId") storyId: string,
  //   @CurrentUser("userId") userId: string,
  //   @Body() dto: CreatePlotPointDto,
  // ) {
  //   return this.plotPointService.create(storyId, userId, dto);
  // }

  // @Post(":storyId/note")
  // async newNote(
  //   @Param("storyId") storyId: string,
  //   @CurrentUser("userId") userId: string,
  //   @Body() dto: CreateNoteDto,
  // ) {
  //   return this.notesService.create(storyId, userId, dto);
  // }
}
