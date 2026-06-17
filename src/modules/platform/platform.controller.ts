import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { TranslateToPlatformDtoL } from "./platform.dto";
import { PlatformService } from "./platform.service";

@Controller("platform")
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post(":storyId/translate")
  async translateToPlatform(
    @Param("storyId") storyId: string,
    @Req() req: any,
    @Body() dto: TranslateToPlatformDtoL,
  ): Promise<any> {
    const { userId } = req.user as { userId: string };
    return this.platformService.translateToPlatform(storyId, userId, dto.body);
  }

  @Post(":storyId/note")
  async createNote(): Promise<any> {}

  @Post(":storyId/plot-point")
  async createPlotPoint(): Promise<any> {}

  @Post(":storyId/mention")
  async createMention(): Promise<any> {}
}
