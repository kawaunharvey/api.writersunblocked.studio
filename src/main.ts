import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfigService } from './common/config/app-config.service';
import { AppModule } from './app.module';
import * as express from 'express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService);

  // Raw body for Stripe webhook signature verification — must be before global JSON parser
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

  // Cookie parser — required for reading httpOnly JWT cookie
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  app.enableCors({
    origin: config.nextJsOrigin,
    credentials: true,
  });

  await app.listen(config.port);
  logger.log(`Nest API listening on port ${config.port}`);
  logger.log(`CORS origin set to ${config.nextJsOrigin}`);
}
bootstrap();
