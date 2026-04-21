import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { ApiModule } from './api/api.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AppConfigModule } from './common/config/config.module';
import { AppConfigService } from './common/config/app-config.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { EntitiesModule } from './entities/entities.module';
import { EventsModule } from './events/events.module';
import { GatewayModule } from './gateway/gateway.module';
import { PaymentsModule } from './payments/payments.module';
import { QueuesModule } from './queues/queues.module';
import { WorkerModule } from './queues/worker.module';
import { SimulationModule } from './simulation/simulation.module';
import { StoriesModule } from './stories/stories.module';
import { BlocksModule } from './blocks/blocks.module';
import { ThreadsModule } from './threads/threads.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';
import { PassagesModule } from './passages/passages.module';

type RequestWithIds = IncomingMessage & {
  id?: string | number;
  requestId?: string;
};

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.nodeEnv === 'production' ? 'info' : 'debug',
          genReqId: (req: IncomingMessage) => {
            const request = req as RequestWithIds;
            if (request.requestId) {
              return request.requestId;
            }

            if (request.id !== undefined && request.id !== null) {
              return String(request.id);
            }

            return randomUUID();
          },
          customProps: (req: IncomingMessage) => {
            const request = req as RequestWithIds;
            return {
              requestId: request.requestId ?? (request.id !== undefined ? String(request.id) : undefined),
            };
          },
          customReceivedMessage: (req) => `--> ${req.method} ${req.url}`,
          customSuccessMessage: (req, res) => `<-- ${req.method} ${req.url} ${res.statusCode}`,
          customErrorMessage: (req, res, err) => `<-- ${req.method} ${req.url} ${res.statusCode} ERROR: ${err.message}`,
          customSuccessObject: (req, res, loggableObject) => ({
            ...loggableObject,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
          }),
          customErrorObject: (req, res, err, loggableObject) => ({
            ...loggableObject,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            errorMessage: err.message,
          }),
          autoLogging: {
            ignore: (req) => {
              const url = (req as IncomingMessage & { url?: string }).url ?? '';
              const silenced = ['/health', '/auth/google/callback'];
              return silenced.some((path) => url.startsWith(path));
            },
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
            remove: true,
          },
          transport: config.nodeEnv === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  levelFirst: true,
                  ignore: 'pid,hostname',
                  messageFormat: '{msg} reqId={requestId} responseTime={responseTime}ms',
                  singleLine: false,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
        },
      }),
    }),
    DatabaseModule,
    EventsModule,
    QueuesModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    PassagesModule,
    BlocksModule,
    EntitiesModule,
    ThreadsModule,
    AiModule,
    WorkerModule,
    SimulationModule,
    GatewayModule,
    PaymentsModule,
    EmailModule,
    ApiModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
