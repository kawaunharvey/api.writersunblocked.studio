import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './locations.dto';

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('stories/:storyId/locations')
      list(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.locationsService.list(storyId, userId);
  }

  @Post('stories/:storyId/locations')
  create(
    @Param('storyId') storyId: string,
    @Req() req: any,
    @Body() dto: CreateLocationDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.locationsService.create(storyId, userId, dto);
  }

  @Patch('locations/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateLocationDto) {
    const { userId } = req.user as { userId: string };
    return this.locationsService.update(id, userId, dto);
  }

  @Delete('locations/:id')
  @HttpCode(204)
      async remove(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.locationsService.delete(id, userId);
  }
}
