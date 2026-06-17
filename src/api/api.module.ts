import { AppConfigModule } from '@/common/config/config.module'
import { DatabaseModule } from '@/database/database.module'
import { EmailModule } from '@/email/email.module'
import { Module } from '@nestjs/common'
import { InternalUsersController } from './users.controller'
import { WaitlistController } from './waitlist.controller'

@Module({
  imports: [AppConfigModule, DatabaseModule, EmailModule],
  controllers: [InternalUsersController, WaitlistController],
})
export class ApiModule {}
