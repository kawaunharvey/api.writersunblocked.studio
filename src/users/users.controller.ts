import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    Get,
    Patch,
    Post,
    Req
} from '@nestjs/common'
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { UsersService, isValidHandle, normalizeHandle } from './users.service'

class UpdateHandleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]{3,30}$/, { message: 'handle may only contain lowercase letters, numbers, and underscores' })
  handle: string;
}

class UpdateMeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}

class UpdateNotificationsDto {
  // Allow any boolean fields for notification preferences
  [key: string]: any;
}

class ApplyReferralDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() req: any) {
    const user = req.user as { userId: string };
    return this.usersService.findById(user.userId);
  }

  @Patch('me/handle')
  async updateHandle(@Req() req: any, @Body() dto: UpdateHandleDto) {
    const { userId } = req.user as { userId: string };
    const handle = normalizeHandle(dto.handle);

    if (!isValidHandle(handle)) {
      throw new BadRequestException('handle may only contain lowercase letters, numbers, and underscores (3–30 chars)');
    }

    const taken = await this.usersService.isHandleTaken(handle);
    if (taken) {
      throw new ConflictException('handle is already taken');
    }

    return this.usersService.updateHandle(userId, handle);
  }

  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    const { userId } = req.user as { userId: string };
    const name = dto.name?.trim();

    if (!name || name.length < 2) {
      throw new BadRequestException('name must be at least 2 characters');
    }

    return this.usersService.updateName(userId, name);
  }

  @Get('me/referral')
  async getReferralInfo(@Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.usersService.getReferralInfo(userId);
  }

  @Post('me/referral/apply')
  async applyReferral(@Req() req: any, @Body() dto: ApplyReferralDto) {
    const { userId } = req.user as { userId: string };
    return this.usersService.applyReferral(userId, dto.code);
  }

  @Patch('me/notifications')
  async updateNotifications(@Req() req: any, @Body() dto: UpdateNotificationsDto) {
    const { userId } = req.user as { userId: string };
    return this.usersService.updateNotifications(userId, dto);
  }

  @Delete('me')
  async deleteAccount(@Req() req: any) {
    const { userId } = req.user as { userId: string };
    return this.usersService.softDeleteUser(userId);
  }
}
