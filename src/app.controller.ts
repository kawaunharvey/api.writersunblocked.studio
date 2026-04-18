import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @Public()
  @Get()
  root() {
    return {
      service: 'writers-unblocked-api',
      status: 'ready' as const,
    };
  }
}
