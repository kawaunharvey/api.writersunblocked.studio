import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AppConfigService } from '../common/config/app-config.service'
import { AppConfigModule } from '../common/config/config.module'
import { DatabaseModule } from '../database/database.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { GoogleReferralMiddleware } from './google-referral.middleware'
import { GoogleStrategy } from './google.strategy'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.jwtExpiry },
      }) as any,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(GoogleReferralMiddleware)
      .forRoutes({ path: 'auth/google', method: RequestMethod.GET });
  }
}
