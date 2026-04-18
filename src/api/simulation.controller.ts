import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { SimulationService } from '../simulation/simulation.service';

const simulateSchema = z.object({
  storyId: z.string().min(1),
  highlightBlockId: z.string().min(1),
  question: z.string().default(''),
  blockWindowSize: z.number().int().positive().optional(),
});

const rateSchema = z.object({
  action: z.enum(['rated_up', 'rated_down', 'ignored', 'wrote_from']),
});

const promoteSchema = z.object({
  tier: z.enum(['intended_path', 'canonical']),
});

@Controller()
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post('simulate')
  async simulate(@Body() body: unknown, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    const parsed = simulateSchema.parse(body);
    return this.simulationService.simulate({ ...parsed, userId });
  }

  @Patch('simulations/:id/rate')
  async rate(@Param('id') id: string, @Body() body: unknown) {
    const parsed = rateSchema.parse(body);
    await this.simulationService.rateSimulation({ simulationId: id, action: parsed.action });
    return { id, ...parsed, ok: true };
  }

  @Patch('simulations/:id/promote')
  async promote(@Param('id') id: string, @Body() body: unknown) {
    const parsed = promoteSchema.parse(body);
    await this.simulationService.promoteSimulation({ simulationId: id, tier: parsed.tier });
    return { id, ...parsed, ok: true };
  }

  @Get('stories/:storyId/history')
  async history(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.simulationService.getHistory(storyId, userId);
  }
}
