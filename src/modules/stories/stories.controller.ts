import { AppConfigService } from "@/common/config/app-config.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { CreateStoryDto, UpdateSceneContentDto, UpdateStoryMetadataDto } from "./stories.dto";
import { StoriesService } from "./stories.service";

@Controller()
export class StoriesController {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly config: AppConfigService,
  ) {}

  @Get("stories")
  list(@Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.listForUser(userId);
  }

  @Post("stories")
  create(@Req() req: any, @Body() dto: CreateStoryDto) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.create(userId, dto.title, dto.penName, dto.mode);
  }

  @Get("stories/:id")
  findOne(@Param("id") id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.findById(id, userId);
  }

  @Patch("stories/:id/metadata")
  updateMetadata(
    @Param("id") id: string,
    @Req() req: any,
    @Body() dto: UpdateStoryMetadataDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.updateMetadata(id, userId, dto.metadata);
  }

  // @Patch("stories/:id")
  // update(
  //   @Param("id") id: string,
  //   @Req() req: any,
  //   @Body() dto: UpdateStoryDto,
  // ) {
  //   const { userId } = req.user as { userId: string };
  //   return this.storiesService.update(id, userId, dto);
  // }

  @Patch("stories/:storyId/scenes/:sceneId/content")
  updateSceneContent(
    @Param("storyId") storyId: string,
    @Param("sceneId") sceneId: string,
    @Req() req: any,
    @Body() dto: UpdateSceneContentDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.storiesService.updateSceneContent(
      storyId,
      userId,
      sceneId,
      dto,
    );
  }

  @Delete("stories/:id")
  @HttpCode(204)
  async remove(@Param("id") id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.storiesService.delete(id, userId);
  }

  // @Get("stories/:id/blocks")
  // getBlocks(@Param("id") id: string, @Req() req: any) {
  //   const { userId } = req.user as { userId: string };
  //   return this.storiesService.getBlocks(id, userId);
  // }
}
