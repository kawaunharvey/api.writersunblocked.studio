import { AuthModule } from "@/modules/auth/auth.module";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { PaymentsModule } from "@/modules/payments/payments.module";
import { ScenesModule } from "@/modules/scenes/scenes.module";
import { SubscriptionsModule } from "@/modules/subscriptions/subscriptions.module";
import { UsersModule } from "@/modules/users/users.module";
import { BullModule } from "@nestjs/bullmq";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { LoggerModule } from "nestjs-pino";
import { ApiModule } from "./api/api.module";
import { AppController } from "./app.controller";
import { AppConfigService } from "./common/config/app-config.service";
import { AppConfigModule } from "./common/config/config.module";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { DatabaseModule } from "./database/database.module";
import { EmailModule } from "./email/email.module";
import { EventsModule } from "./events/events.module";
import { AiModule } from "./modules/ai/ai.module";
import { EditorAnalysisModule } from "./modules/editor-analysis/editor-analysis.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { StoriesModule } from "./modules/stories/stories.module";
import { StoryboardModule } from "./modules/storyboard/storyboard.module";

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
          level: config.nodeEnv === "production" ? "info" : "debug",
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
              requestId:
                request.requestId ??
                (request.id !== undefined ? String(request.id) : undefined),
            };
          },
          customReceivedMessage: (req) => `--> ${req.method} ${req.url}`,
          customSuccessMessage: (req, res) =>
            `<-- ${req.method} ${req.url} ${res.statusCode}`,
          customErrorMessage: (req, res, err) =>
            `<-- ${req.method} ${req.url} ${res.statusCode} ERROR: ${err.message}`,
          customReceivedObject: (req, _res, loggableObject) => ({
            requestId:
              loggableObject?.requestId ??
              (req as RequestWithIds).requestId ??
              ((req as RequestWithIds).id !== undefined
                ? String((req as RequestWithIds).id)
                : undefined),
            method: req.method,
            url: req.url,
          }),
          customSuccessObject: (req, res, loggableObject) => ({
            requestId:
              loggableObject?.requestId ??
              (req as RequestWithIds).requestId ??
              ((req as RequestWithIds).id !== undefined
                ? String((req as RequestWithIds).id)
                : undefined),
            responseTime: loggableObject?.responseTime,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
          }),
          customErrorObject: (req, res, err, loggableObject) => ({
            requestId:
              loggableObject?.requestId ??
              (req as RequestWithIds).requestId ??
              ((req as RequestWithIds).id !== undefined
                ? String((req as RequestWithIds).id)
                : undefined),
            responseTime: loggableObject?.responseTime,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            errorMessage: err.message,
          }),
          autoLogging: {
            ignore: (req) => {
              const url = (req as IncomingMessage & { url?: string }).url ?? "";
              const silenced = ["/health", "/auth/google/callback"];
              return silenced.some((path) => url.startsWith(path));
            },
          },
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
            ],
            remove: true,
          },
          transport:
            config.nodeEnv === "development"
              ? {
                  target: "pino-pretty",
                  options: {
                    colorize: true,
                    levelFirst: true,
                    ignore: "pid,hostname",
                    messageFormat:
                      "{msg} reqId={requestId} responseTime={responseTime}ms",
                    singleLine: true,
                    translateTime: "SYS:standard",
                  },
                }
              : undefined,
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const url = new URL(config.redisUrl);
        return {
          prefix: "wuapi",
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    DatabaseModule,
    EventsModule,
    AuthModule,
    UsersModule,
    StoriesModule,
    StoryboardModule,
    ScenesModule,
    EditorAnalysisModule,
    PlatformModule,
    AiModule,
    PaymentsModule,
    EmailModule,
    ApiModule,
    SubscriptionsModule,
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
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
