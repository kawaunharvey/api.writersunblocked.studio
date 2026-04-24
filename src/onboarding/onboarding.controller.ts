import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common'
import {
    AnalyzePlannerDraftDto,
    AnalyzePlannerDraftResponse,
    StartOnboardingDto,
} from './onboarding.dto'
import { OnboardingService } from './onboarding.service'

@Controller()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('stories/:storyId/onboard')
  @HttpCode(202)
  async onboard(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: StartOnboardingDto,
  ) {
    const { userId } = req.user as { userId: string };
    await this.onboardingService.enqueue(storyId, userId, dto.answers);
    return { accepted: true };
  }

  @Post('stories/:storyId/onboard/analyze')
  async analyzeDraft(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: AnalyzePlannerDraftDto,
  ): Promise<AnalyzePlannerDraftResponse> {
    const { userId } = req.user as { userId: string };
    return this.onboardingService.analyzeDraft(storyId, userId, dto.draft);
  }
}
