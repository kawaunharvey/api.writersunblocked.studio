import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import * as express from 'express'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { AppConfigService } from './common/config/app-config.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance().disable('x-powered-by');
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('x-company-name', 'The Hereafter Technologies');
    next();
  });

  const config = app.get(AppConfigService);
  const logger = app.get(Logger);

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
  logger.log(`Nest API listening on port ${config.port}`, 'Bootstrap');
  logger.log(`CORS origin set to ${config.nextJsOrigin}`, 'Bootstrap');
}
bootstrap();
