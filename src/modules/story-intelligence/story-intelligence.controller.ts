import { CurrentUser } from '@/decorators/current-user.decorator';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { IntelligenceContextService } from './services/intelligence-context.service';
import { IntelligenceOrchestratorService } from './services/intelligence-orchestrator.service';
import { ThreadService } from './services/thread.service';

@Controller('stories/:storyId/intelligence')
export class StoryIntelligenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly threadService: ThreadService,
    private readonly contextService: IntelligenceContextService,
    private readonly orchestrator: IntelligenceOrchestratorService,
  ) {}

  private async assertStoryOwnership(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.userId !== userId) {
      throw new ForbiddenException();
    }
  }

  @Get('threads')
  async listThreads(
    @Param('storyId') storyId: string,
    @CurrentUser('userId') userId: string,
    @Query('layer') layer?: string,
    @Query('canonStatus') canonStatus?: string,
    @Query('sceneId') sceneId?: string,
    @Query('status') status?: string,
  ) {
    await this.assertStoryOwnership(storyId, userId);
    return this.threadService.listThreads(storyId, {
      layer,
      canonStatus,
      sceneId,
      status,
    });
  }

  @Get('context')
  async getContext(
    @Param('storyId') storyId: string,
    @CurrentUser('userId') userId: string,
    @Query('sceneId') sceneId?: string,
  ) {
    await this.assertStoryOwnership(storyId, userId);
    return this.contextService.buildContext(storyId, sceneId);
  }

  @Get('runs')
  async listRuns(
    @Param('storyId') storyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.assertStoryOwnership(storyId, userId);
    return this.contextService.listRuns(storyId);
  }
}

@Controller('stories/:storyId/scenes/:sceneId/intelligence')
export class SceneIntelligenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: IntelligenceContextService,
    private readonly orchestrator: IntelligenceOrchestratorService,
  ) {}

  private async assertSceneOwnership(
    storyId: string,
    sceneId: string,
    userId: string,
  ) {
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, storyId },
      select: {
        id: true,
        activeVersionId: true,
        story: { select: { userId: true } },
      },
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    if (scene.story.userId !== userId) {
      throw new ForbiddenException();
    }

    return scene;
  }

  @Get('context')
  async getSceneContext(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.assertSceneOwnership(storyId, sceneId, userId);
    return this.contextService.buildContext(storyId, sceneId);
  }

  @Post('analyze')
  async analyzeScene(
    @Param('storyId') storyId: string,
    @Param('sceneId') sceneId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.assertSceneOwnership(storyId, sceneId, userId);

    const result = await this.orchestrator.enqueueSceneAnalysis(sceneId, userId);

    return {
      queued: result.queued,
      sceneId,
      reason: result.reason,
      inputId: result.input.id,
    };
  }
}
