import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai/ai.module';
import { ApiModule } from './api/api.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AppConfigModule } from './common/config/config.module';
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

@Module({
  imports: [
    AppConfigModule,
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
