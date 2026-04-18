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
import { CharactersService } from './characters.service';
import { CreateCharacterDto, UpdateCharacterDto, AddAliasDto } from './characters.dto';

@Controller()
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get('stories/:storyId/characters')
      list(@Param('storyId') storyId: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.charactersService.list(storyId, userId);
  }

  @Post('stories/:storyId/characters')
  create(
    @Param('storyId') storyId: string,
      @Req() req: any,
    @Body() dto: CreateCharacterDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.charactersService.create(storyId, userId, dto);
  }

  @Patch('characters/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateCharacterDto) {
    const { userId } = req.user as { userId: string };
    return this.charactersService.update(id, userId, dto);
  }

  @Post('characters/:id/aliases')
  addAlias(@Param('id') id: string, @Req() req: any, @Body() dto: AddAliasDto) {
    const { userId } = req.user as { userId: string };
    return this.charactersService.addAlias(id, userId, dto);
  }

  @Delete('characters/:id/aliases/:aliasText')
  @HttpCode(200)
  removeAlias(
    @Param('id') id: string,
    @Param('aliasText') aliasText: string,
    @Req() req: any,
  ) {
    const { userId } = req.user as { userId: string };
    return this.charactersService.removeAlias(id, userId, aliasText);
  }

  @Delete('characters/:id')
  @HttpCode(204)
      async remove(@Param('id') id: string, @Req() req: any) {
    const { userId } = req.user as { userId: string };
    await this.charactersService.delete(id, userId);
  }
}
