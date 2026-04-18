import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Attaches a unique request-id to every incoming HTTP request.
 * Honours an existing `x-request-id` header from the client/proxy, or
 * generates a new UUID. Echoes the value back in the response header.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const existing = req.headers['x-request-id'];
    req.requestId = typeof existing === 'string' && existing.length > 0
      ? existing
      : randomUUID();
    next();
  }
}
