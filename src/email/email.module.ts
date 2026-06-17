import { AppConfigModule } from '@/common/config/config.module'
import { Module } from '@nestjs/common'
import { MailgunService } from './mailgun.service'

@Module({
  imports: [AppConfigModule],
  providers: [MailgunService],
  exports: [MailgunService],
})
export class EmailModule {}
