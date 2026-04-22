import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common'
import { PatchWorldCanonDto } from './world-canon.dto'
import { WorldCanonService } from './world-canon.service'

@Controller()
export class WorldCanonController {
  constructor(private readonly worldCanonService: WorldCanonService) {}

  @Get('stories/:storyId/world-canon')
  getOrCreate(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.worldCanonService.getOrCreate(storyId, userId);
  }

  @Patch('stories/:storyId/world-canon')
  patch(@Param('storyId') storyId: string, @Req() req: any, @Body() dto: PatchWorldCanonDto) {
    const { userId } = req.user as { userId: string };
    return this.worldCanonService.patch(storyId, userId, dto.rules);
  }
}
