import { AppConfigService } from '@/common/config/app-config.service'
import { PrismaService } from '@/database/prisma.service'
import { isValidHandle, normalizeHandle } from '@/modules//users/users.service'
import { Public } from '@/modules/auth/public.decorator'
import { BadRequestException, Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common'

@Controller('users')
export class InternalUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * GET /users/handle-availability?handle=<handle>
   *
   * Protected by x-internal-api-secret header.
   * Returns { handle, available } so callers can check uniqueness before
   * committing a handle choice to the user, e.g. during onboarding.
   */
  @Public()
  @Get('handle-availability')
  async checkHandleAvailability(
    @Headers('x-internal-api-secret') secret: string | undefined,
    @Query('handle') handle: string | undefined,
  ) {
    if (!secret || secret !== this.config.internalApiSecret) {
      throw new UnauthorizedException('Invalid internal API secret');
    }

    if (!handle || typeof handle !== 'string') {
      throw new BadRequestException('handle query parameter is required');
    }

    const normalized = normalizeHandle(handle);

    if (!isValidHandle(normalized)) {
      throw new BadRequestException(
        'handle must be 3–30 characters and contain only lowercase letters, numbers, and underscores',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { handle: normalized },
      select: { id: true },
    });

    return { handle: normalized, available: existing === null };
  }
}
